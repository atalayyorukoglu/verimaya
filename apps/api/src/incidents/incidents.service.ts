import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { IncidentCreate, IncidentListQuery } from '@verimaya/shared';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toIncident } from '../common/mappers';
import { appointments, contacts, incidentTypes, incidents } from '../db/schema';
import type { IncidentRow } from '../db/schema/incidents';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

const responsibleContacts = alias(contacts, 'incidents_responsible');

/**
 * AI-05 girdisi — "ne ters gitti" kaydı. docs/2026-08-23-maya-icgoru-sorulari.md § 5.
 *
 * **RPT randevusuna dokunmaz.** RPT randevusu olgu, olay kaydı yorum — bu servis
 * `appointments` tablosunu yalnız opsiyonel bağlantı için okur, hiç yazmaz.
 */
@Injectable()
export class IncidentsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: IncidentListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(incidents.createdAt, incidents.id, params.cursor);
			const filters: SQL[] = [isNull(incidents.deletedAt)];
			if (params.contact_id) filters.push(eq(incidents.contactId, params.contact_id));
			if (params.area) filters.push(eq(incidents.area, params.area));
			if (params.status) filters.push(eq(incidents.status, params.status));
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select({
					incident: incidents,
					contactDisplayName: contacts.displayName,
					incidentTypeName: incidentTypes.name,
					responsibleDisplayName: responsibleContacts.displayName
				})
				.from(incidents)
				.innerJoin(contacts, eq(incidents.contactId, contacts.id))
				.innerJoin(incidentTypes, eq(incidents.incidentTypeId, incidentTypes.id))
				.leftJoin(responsibleContacts, eq(incidents.responsibleContactId, responsibleContacts.id))
				.where(and(...filters))
				.orderBy(desc(incidents.createdAt), desc(incidents.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(
				rows.map((row) => ({ ...row, id: row.incident.id, createdAt: row.incident.createdAt })),
				params.limit
			);
			return {
				items: page.items.map((row) =>
					toIncident(row.incident, {
						contactDisplayName: row.contactDisplayName,
						incidentTypeName: row.incidentTypeName,
						responsibleDisplayName: row.responsibleDisplayName
					})
				),
				next_cursor: page.next_cursor
			};
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: IncidentCreate) {
		const contact = await this.requireActiveContact(db, input.contact_id);

		const [type] = await db
			.select()
			.from(incidentTypes)
			.where(eq(incidentTypes.id, input.incident_type_id))
			.limit(1);
		if (!type) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Incident type not found' }
			});
		}

		let responsibleContactId = input.responsible_contact_id ?? null;
		if (input.appointment_id) {
			const [appointment] = await db
				.select()
				.from(appointments)
				.where(and(eq(appointments.id, input.appointment_id), isNull(appointments.deletedAt)))
				.limit(1);
			if (!appointment) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Appointment not found' }
				});
			}
			if (appointment.contactId !== input.contact_id) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: 'Appointment does not belong to this contact'
					}
				});
			}
			// Sorumlu taraf belirtilmemişse randevunun kliniğinden otomatik gelir — kullanıcı
			// ekstra alan doldurmaz, rapor yine de "hangi klinik" kırılımını alır.
			if (responsibleContactId == null && appointment.clinicContactId) {
				responsibleContactId = appointment.clinicContactId;
			}
		}

		let responsibleDisplayName: string | null = null;
		if (responsibleContactId) {
			const [responsible] = await db
				.select({ displayName: contacts.displayName })
				.from(contacts)
				.where(eq(contacts.id, responsibleContactId))
				.limit(1);
			responsibleDisplayName = responsible?.displayName ?? null;
		}

		const [row] = await db
			.insert(incidents)
			.values({
				tenantId,
				contactId: input.contact_id,
				incidentTypeId: input.incident_type_id,
				area: type.area,
				appointmentId: input.appointment_id ?? null,
				responsibleContactId,
				costAmount: input.cost_amount ?? null,
				costCurrency: input.cost_currency ?? null,
				description: input.description?.trim() || null,
				occurredOn: input.occurred_on
			})
			.returning();

		return toIncident(row!, {
			contactDisplayName: contact.displayName,
			incidentTypeName: type.name,
			responsibleDisplayName
		});
	}

	async resolveWithDb(db: TenantDb, id: string) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Incident not found' }
			});
		}

		if (existing.status === 'resolved') {
			return toIncident(existing, await this.loadJoinedNames(db, existing));
		}

		const [row] = await db
			.update(incidents)
			.set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
			.where(eq(incidents.id, id))
			.returning();

		return toIncident(row!, await this.loadJoinedNames(db, row!));
	}

	async softDeleteWithDb(id: string, tenantId: string, db: TenantDb) {
		const existing = await this.findActiveRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Incident not found' }
			});
		}
		if (existing.tenantId !== tenantId) {
			// TenantContextService already scopes the query by RLS; this is defense in depth.
			throw new ForbiddenException({
				error: { code: 'forbidden', message: 'Incident belongs to another tenant' }
			});
		}

		await db
			.update(incidents)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(incidents.id, id));

		return { id, deleted: true as const };
	}

	private async findActiveRow(db: TenantDb, id: string): Promise<IncidentRow | undefined> {
		const [row] = await db
			.select()
			.from(incidents)
			.where(and(eq(incidents.id, id), isNull(incidents.deletedAt)))
			.limit(1);
		return row;
	}

	private async requireActiveContact(db: TenantDb, contactId: string) {
		const [contact] = await db
			.select()
			.from(contacts)
			.where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
			.limit(1);
		if (!contact) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		return contact;
	}

	private async loadJoinedNames(db: TenantDb, row: IncidentRow) {
		const [contact] = await db
			.select({ displayName: contacts.displayName })
			.from(contacts)
			.where(eq(contacts.id, row.contactId))
			.limit(1);
		const [type] = await db
			.select({ name: incidentTypes.name })
			.from(incidentTypes)
			.where(eq(incidentTypes.id, row.incidentTypeId))
			.limit(1);
		let responsibleDisplayName: string | null = null;
		if (row.responsibleContactId) {
			const [responsible] = await db
				.select({ displayName: contacts.displayName })
				.from(contacts)
				.where(eq(contacts.id, row.responsibleContactId))
				.limit(1);
			responsibleDisplayName = responsible?.displayName ?? null;
		}
		return {
			contactDisplayName: contact?.displayName ?? '—',
			incidentTypeName: type?.name ?? '—',
			responsibleDisplayName
		};
	}
}
