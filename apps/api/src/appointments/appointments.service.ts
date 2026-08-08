import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import type { AppointmentCreate, AppointmentListQuery, AppointmentUpdate } from '@verimaya/shared';
import { tenantDayRange } from '@verimaya/shared';
import { appointments, patients, tenants } from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAppointment } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class AppointmentsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: AppointmentListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const timezone = await this.getTenantTimezone(db, tenantId);
			const filters: SQL[] = [isNull(appointments.deletedAt)];
			const cursorCond = createdAtCursorCondition(
				appointments.createdAt,
				appointments.id,
				params.cursor
			);
			if (cursorCond) filters.push(cursorCond);
			if (params.patient_id) filters.push(eq(appointments.patientId, params.patient_id));
			if (params.from) {
				const { start } = tenantDayRange(params.from, timezone);
				filters.push(gte(appointments.startsAt, start));
			}
			if (params.to) {
				const { endExclusive } = tenantDayRange(params.to, timezone);
				filters.push(lt(appointments.startsAt, endExclusive));
			}

			const rows = await db
				.select()
				.from(appointments)
				.where(and(...filters))
				.orderBy(desc(appointments.createdAt), desc(appointments.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toAppointment),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: AppointmentCreate) {
		const patientDisplayName = await this.requirePatientName(db, input.patient_id);
		const [row] = await db
			.insert(appointments)
			.values({
				tenantId,
				patientId: input.patient_id,
				patientDisplayName,
				title: input.title ?? null,
				appointmentType: input.appointment_type ?? null,
				status: input.status ?? 'scheduled',
				startsAt: new Date(input.starts_at),
				endsAt: input.ends_at ? new Date(input.ends_at) : null,
				clinicName: input.clinic_name ?? null,
				hotelName: input.hotel_name ?? null,
				transferNote: input.transfer_note ?? null,
				clinicContactId: input.clinic_contact_id ?? null,
				hotelContactId: input.hotel_contact_id ?? null,
				transferContactId: input.transfer_contact_id ?? null,
				notes: input.notes ?? null
			})
			.returning();
		return toAppointment(row!);
	}

	async updateWithDb(db: TenantDb, id: string, input: AppointmentUpdate) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Appointment not found' }
			});
		}

		const patientId = input.patient_id ?? existing.patientId;
		const patientDisplayName =
			input.patient_id !== undefined
				? await this.requirePatientName(db, patientId)
				: existing.patientDisplayName;

		const [row] = await db
			.update(appointments)
			.set({
				patientId,
				patientDisplayName,
				title: input.title !== undefined ? input.title : existing.title,
				appointmentType:
					input.appointment_type !== undefined
						? input.appointment_type
						: existing.appointmentType,
				status: input.status ?? existing.status,
				startsAt: input.starts_at ? new Date(input.starts_at) : existing.startsAt,
				endsAt:
					input.ends_at !== undefined
						? input.ends_at
							? new Date(input.ends_at)
							: null
						: existing.endsAt,
				clinicName:
					input.clinic_name !== undefined ? input.clinic_name : existing.clinicName,
				hotelName:
					input.hotel_name !== undefined ? input.hotel_name : existing.hotelName,
				transferNote:
					input.transfer_note !== undefined ? input.transfer_note : existing.transferNote,
				clinicContactId:
					input.clinic_contact_id !== undefined
						? input.clinic_contact_id
						: existing.clinicContactId,
				hotelContactId:
					input.hotel_contact_id !== undefined
						? input.hotel_contact_id
						: existing.hotelContactId,
				transferContactId:
					input.transfer_contact_id !== undefined
						? input.transfer_contact_id
						: existing.transferContactId,
				notes: input.notes !== undefined ? input.notes : existing.notes,
				updatedAt: new Date()
			})
			.where(eq(appointments.id, id))
			.returning();

		return toAppointment(row!);
	}

	async softDeleteWithDb(
		db: TenantDb,
		tenantId: string,
		id: string,
		actor: AuditActor
	) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Appointment not found' }
			});
		}

		await db
			.update(appointments)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(appointments.id, id));

		const label = existing.title ?? existing.patientDisplayName;
		await writeAuditLog(db, tenantId, actor, 'delete', 'appointment', label);

		return { id, deleted: true as const };
	}

	private async getTenantTimezone(db: TenantDb, tenantId: string) {
		const [row] = await db
			.select({ timezone: tenants.timezone })
			.from(tenants)
			.where(eq(tenants.id, tenantId))
			.limit(1);
		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Tenant not found' }
			});
		}
		return row.timezone;
	}

	private async findActiveRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(appointments)
			.where(and(eq(appointments.id, id), isNull(appointments.deletedAt)))
			.limit(1);
		return row;
	}

	private async requirePatientName(db: TenantDb, patientId: string) {
		const [patient] = await db
			.select({ fullName: patients.fullName })
			.from(patients)
			.where(and(eq(patients.id, patientId), isNull(patients.deletedAt)))
			.limit(1);
		if (!patient) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Patient not found' }
			});
		}
		return patient.fullName;
	}
}
