import { Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, gte, isNull, lt, type SQL } from 'drizzle-orm';
import type {
	AppointmentCreate,
	AppointmentListQuery,
	AppointmentStatus,
	AppointmentUpdate
} from '@verimaya/shared';
import { appointmentStatusSchema, tenantDayRange } from '@verimaya/shared';
import { appointments, contacts, tenants } from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAppointment } from '../common/mappers';
import { textSearchCondition } from '../common/search';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class AppointmentsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: AppointmentListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const timezone = await this.getTenantTimezone(db, tenantId);
			const cursorCond = createdAtCursorCondition(
				appointments.createdAt,
				appointments.id,
				params.cursor
			);
			const baseFilters: SQL[] = [isNull(appointments.deletedAt)];
			if (params.contact_id) baseFilters.push(eq(appointments.contactId, params.contact_id));
			if (params.from) {
				const { start } = tenantDayRange(params.from, timezone);
				baseFilters.push(gte(appointments.startsAt, start));
			}
			if (params.to) {
				const { endExclusive } = tenantDayRange(params.to, timezone);
				baseFilters.push(lt(appointments.startsAt, endExclusive));
			}
			if (params.status) baseFilters.push(eq(appointments.status, params.status));
			const searchCond = textSearchCondition(params.q, [
				appointments.contactDisplayName,
				appointments.notes,
				appointments.clinicName,
				appointments.hotelName
			]);
			if (searchCond) baseFilters.push(searchCond);

			const typeRows = await db
				.select({
					appointmentType: appointments.appointmentType,
					n: count()
				})
				.from(appointments)
				.where(and(...baseFilters))
				.groupBy(appointments.appointmentType);

			const statusRows = await db
				.select({
					status: appointments.status,
					n: count()
				})
				.from(appointments)
				.where(and(...baseFilters))
				.groupBy(appointments.status);

			const type_counts: Record<string, number> = {};
			for (const row of typeRows) {
				type_counts[row.appointmentType ?? ''] = Number(row.n);
			}

			const status_counts: Partial<Record<AppointmentStatus, number>> = {};
			for (const row of statusRows) {
				const parsed = appointmentStatusSchema.safeParse(row.status);
				if (!parsed.success) continue;
				status_counts[parsed.data] = Number(row.n);
			}

			const pageFilters = [...baseFilters];
			if (cursorCond) pageFilters.push(cursorCond);

			const rows = await db
				.select()
				.from(appointments)
				.where(and(...pageFilters))
				.orderBy(desc(appointments.createdAt), desc(appointments.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toAppointment),
				next_cursor: page.next_cursor,
				type_counts,
				status_counts
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: AppointmentCreate) {
		const contactDisplayName = await this.requireContactName(db, input.contact_id);
		const [row] = await db
			.insert(appointments)
			.values({
				tenantId,
				contactId: input.contact_id,
				contactDisplayName,
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

		const contactId = input.contact_id ?? existing.contactId;
		const contactDisplayName =
			input.contact_id !== undefined
				? await this.requireContactName(db, contactId)
				: existing.contactDisplayName;

		const [row] = await db
			.update(appointments)
			.set({
				contactId,
				contactDisplayName,
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

		const label = existing.title ?? existing.contactDisplayName;
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

	private async requireContactName(db: TenantDb, contactId: string) {
		const [contact] = await db
			.select({ displayName: contacts.displayName })
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		return contact.displayName;
	}
}
