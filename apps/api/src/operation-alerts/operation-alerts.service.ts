import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, isNotNull, isNull, lte, type SQL } from 'drizzle-orm';
import type { OperationAlertCreate, OperationAlertKind, OperationAlertListQuery } from '@verimaya/shared';
import {
	DEFAULT_OPERATION_ALERT_THRESHOLDS,
	OPERATION_ALERT_KINDS,
	OPERATION_ALERT_THRESHOLDS_KEY,
	operationAlertDueAt,
	parseOperationAlertThresholds
} from '@verimaya/shared';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildDueAtCursorPage, dueAtCursorCondition } from '../common/list-query';
import { toOperationAlert } from '../common/mappers';
import { appointments, operationAlerts, tenantSettings } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class OperationAlertsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: OperationAlertListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const now = new Date();
			const cursorCond = dueAtCursorCondition(
				operationAlerts.dueAt,
				operationAlerts.id,
				params.cursor
			);
			const filters: SQL[] = [isNull(operationAlerts.deletedAt)];
			if (params.status === 'confirmed') {
				filters.push(isNotNull(operationAlerts.confirmedAt));
			} else if (params.status === 'due') {
				filters.push(isNull(operationAlerts.confirmedAt), lte(operationAlerts.dueAt, now));
			} else if (params.status === 'upcoming') {
				filters.push(isNull(operationAlerts.confirmedAt), gt(operationAlerts.dueAt, now));
			}
			if (params.within_hours != null) {
				const cutoff = new Date(now.getTime() + params.within_hours * 3_600_000);
				filters.push(lte(operationAlerts.dueAt, cutoff));
			}
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select({
					alert: operationAlerts,
					contactDisplayName: appointments.contactDisplayName,
					appointmentStartsAt: appointments.startsAt
				})
				.from(operationAlerts)
				.innerJoin(appointments, eq(operationAlerts.appointmentId, appointments.id))
				.where(and(...filters))
				.orderBy(asc(operationAlerts.dueAt), asc(operationAlerts.id))
				.limit(params.limit + 1);

			const page = buildDueAtCursorPage(
				rows.map((row) => ({ ...row, id: row.alert.id, dueAt: row.alert.dueAt })),
				params.limit
			);
			return {
				items: page.items.map((row) =>
					toOperationAlert(row.alert, row.contactDisplayName, row.appointmentStartsAt, now)
				),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: OperationAlertCreate) {
		const appointment = await this.requireActiveAppointment(db, input.appointment_id);
		const existing = await this.findActiveByAppointmentKind(db, input.appointment_id, input.kind);
		if (existing) {
			throw new ConflictException({
				error: { code: 'conflict', message: 'Operation alert already exists for this kind' }
			});
		}

		const thresholds = await this.loadThresholds(db);
		const thresholdHours = thresholds[input.kind];
		const dueAt = operationAlertDueAt(appointment.startsAt, thresholdHours);

		const [row] = await db
			.insert(operationAlerts)
			.values({
				tenantId,
				appointmentId: input.appointment_id,
				kind: input.kind,
				dueAt,
				thresholdHours
			})
			.returning();

		return toOperationAlert(row!, appointment.contactDisplayName, appointment.startsAt);
	}

	async confirmWithDb(db: TenantDb, id: string, actor: AuditActor) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Operation alert not found' }
			});
		}

		const appointment = await this.requireActiveAppointment(db, existing.appointmentId);
		if (existing.confirmedAt) {
			return toOperationAlert(existing, appointment.contactDisplayName, appointment.startsAt);
		}

		const [row] = await db
			.update(operationAlerts)
			.set({
				confirmedAt: new Date(),
				confirmedBy: actor.actorDisplayName,
				updatedAt: new Date()
			})
			.where(eq(operationAlerts.id, id))
			.returning();

		return toOperationAlert(row!, appointment.contactDisplayName, appointment.startsAt);
	}

	async softDeleteWithDb(db: TenantDb, tenantId: string, id: string, actor: AuditActor) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Operation alert not found' }
			});
		}

		await db
			.update(operationAlerts)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(operationAlerts.id, id));

		await writeAuditLog(db, tenantId, actor, 'delete', 'appointment', `alert:${existing.kind}`);

		return { id, deleted: true as const };
	}

	/** Create all four kinds for a new appointment (or fill any missing kinds). */
	async ensureForAppointmentWithDb(
		db: TenantDb,
		tenantId: string,
		appointmentId: string,
		startsAt: Date
	) {
		const thresholds = await this.loadThresholds(db);
		const existingRows = await db
			.select()
			.from(operationAlerts)
			.where(
				and(eq(operationAlerts.appointmentId, appointmentId), isNull(operationAlerts.deletedAt))
			);
		const byKind = new Map(existingRows.map((row) => [row.kind, row]));

		for (const kind of OPERATION_ALERT_KINDS) {
			const thresholdHours = thresholds[kind];
			const dueAt = operationAlertDueAt(startsAt, thresholdHours);
			const existing = byKind.get(kind);
			if (existing) {
				await db
					.update(operationAlerts)
					.set({ dueAt, thresholdHours, updatedAt: new Date() })
					.where(eq(operationAlerts.id, existing.id));
			} else {
				await db.insert(operationAlerts).values({
					tenantId,
					appointmentId,
					kind,
					dueAt,
					thresholdHours
				});
			}
		}
	}

	/**
	 * Appointment date changed: refresh due_at from the stored threshold.
	 * Confirmed alerts stay confirmed.
	 */
	async rescheduleForAppointmentWithDb(db: TenantDb, appointmentId: string, startsAt: Date) {
		const existingRows = await db
			.select()
			.from(operationAlerts)
			.where(
				and(eq(operationAlerts.appointmentId, appointmentId), isNull(operationAlerts.deletedAt))
			);

		for (const row of existingRows) {
			const dueAt = operationAlertDueAt(startsAt, row.thresholdHours);
			await db
				.update(operationAlerts)
				.set({ dueAt, updatedAt: new Date() })
				.where(eq(operationAlerts.id, row.id));
		}
	}

	async softDeleteForAppointmentWithDb(db: TenantDb, appointmentId: string) {
		await db
			.update(operationAlerts)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(
				and(eq(operationAlerts.appointmentId, appointmentId), isNull(operationAlerts.deletedAt))
			);
	}

	private async loadThresholds(db: TenantDb) {
		const [row] = await db
			.select({ value: tenantSettings.value })
			.from(tenantSettings)
			.where(eq(tenantSettings.key, OPERATION_ALERT_THRESHOLDS_KEY))
			.limit(1);
		if (!row) return { ...DEFAULT_OPERATION_ALERT_THRESHOLDS };
		return parseOperationAlertThresholds(row.value);
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(operationAlerts)
			.where(and(eq(operationAlerts.id, id), isNull(operationAlerts.deletedAt)))
			.limit(1);
		return row;
	}

	private async findActiveByAppointmentKind(
		db: TenantDb,
		appointmentId: string,
		kind: OperationAlertKind
	) {
		const [row] = await db
			.select()
			.from(operationAlerts)
			.where(
				and(
					eq(operationAlerts.appointmentId, appointmentId),
					eq(operationAlerts.kind, kind),
					isNull(operationAlerts.deletedAt)
				)
			)
			.limit(1);
		return row;
	}

	private async requireActiveAppointment(db: TenantDb, appointmentId: string) {
		const [row] = await db
			.select({
				id: appointments.id,
				startsAt: appointments.startsAt,
				contactDisplayName: appointments.contactDisplayName
			})
			.from(appointments)
			.where(and(eq(appointments.id, appointmentId), isNull(appointments.deletedAt)))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Appointment not found' }
			});
		}
		return row;
	}
}
