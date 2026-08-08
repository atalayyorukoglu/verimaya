import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { ContactCreate, ContactListQuery, ContactUpdate, MergeRecords } from '@verimaya/shared';
import { findContactDuplicateGroups } from '@verimaya/shared';
import { appointments, contactTypes, contacts, patients, transactions } from '../db/schema';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toContact } from '../common/mappers';
import { textSearchCondition } from '../common/search';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class ContactsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: ContactListQuery) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				contacts.createdAt,
				contacts.id,
				params.cursor
			);
			const searchCond = textSearchCondition(params.q, [
				contacts.displayName,
				contacts.email,
				contacts.phone
			]);
			const baseFilters: SQL[] = [isNull(contacts.deletedAt)];
			if (searchCond) baseFilters.push(searchCond);
			if (params.type_id) baseFilters.push(eq(contacts.contactTypeId, params.type_id));

			const [totalRow] = await db
				.select({ n: count() })
				.from(contacts)
				.where(baseFilters.length > 0 ? and(...baseFilters) : undefined);

			const pageFilters = [...baseFilters];
			if (cursorCond) pageFilters.push(cursorCond);

			const rows = await db
				.select()
				.from(contacts)
				.where(pageFilters.length > 0 ? and(...pageFilters) : undefined)
				.orderBy(desc(contacts.createdAt), desc(contacts.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toContact),
				next_cursor: page.next_cursor,
				total_count: Number(totalRow?.n ?? 0)
			};
		});
	}

	async get(tenantId: string, id: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const row = await this.findRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			return toContact(row);
		});
	}

	async createWithDb(db: TenantDb, tenantId: string, input: ContactCreate) {
		const typeName = await this.requireContactTypeName(db, input.contact_type_id);
		const [row] = await db
			.insert(contacts)
			.values({
				tenantId,
				contactTypeId: input.contact_type_id,
				contactTypeName: typeName,
				displayName: input.display_name,
				phone: input.phone ?? null,
				email: input.email ?? null,
				notes: input.notes ?? null,
				isInternal: input.is_internal ?? false
			})
			.returning();
		return toContact(row!);
	}

	async updateWithDb(db: TenantDb, id: string, input: ContactUpdate) {
		const existing = await this.findRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const contactTypeId = input.contact_type_id ?? existing.contactTypeId;
		const contactTypeName =
			input.contact_type_id !== undefined
				? await this.requireContactTypeName(db, contactTypeId)
				: existing.contactTypeName;

		const [row] = await db
			.update(contacts)
			.set({
				contactTypeId,
				contactTypeName,
				displayName: input.display_name ?? existing.displayName,
				phone: input.phone !== undefined ? input.phone : existing.phone,
				email: input.email !== undefined ? input.email : existing.email,
				notes: input.notes !== undefined ? input.notes : existing.notes,
				isInternal:
					input.is_internal !== undefined ? input.is_internal : existing.isInternal,
				updatedAt: new Date()
			})
			.where(eq(contacts.id, id))
			.returning();

		return toContact(row!);
	}

	async duplicateGroups(tenantId: string) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const rows = await db.select().from(contacts);
			return { items: findContactDuplicateGroups(rows.map(toContact)) };
		});
	}

	async mergeWithDb(
		db: TenantDb,
		tenantId: string,
		input: MergeRecords,
		actor: AuditActor
	) {
		const { keep_id, merge_ids } = input;
		if (merge_ids.includes(keep_id)) {
			throw new BadRequestException({
				error: { code: 'validation_error', message: 'keep_id cannot be in merge_ids' }
			});
		}

		const keep = await this.findRow(db, keep_id);
		if (!keep) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}

		const sources = [];
		for (const id of merge_ids) {
			const row = await this.findRow(db, id);
			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Contact not found' }
				});
			}
			sources.push(row);
		}

		let phone = keep.phone;
		let email = keep.email;
		let notes = keep.notes;
		let isInternal = keep.isInternal;
		for (const src of sources) {
			if (!phone && src.phone) phone = src.phone;
			if (!email && src.email) email = src.email;
			if (!notes && src.notes) notes = src.notes;
			if (!isInternal && src.isInternal) isInternal = true;
		}

		const [updatedKeep] = await db
			.update(contacts)
			.set({ phone, email, notes, isInternal, updatedAt: new Date() })
			.where(eq(contacts.id, keep_id))
			.returning();

		const dropIds = merge_ids;
		const keepName = updatedKeep!.displayName;

		await db
			.update(transactions)
			.set({ contactId: keep_id, contactLabel: keepName, updatedAt: new Date() })
			.where(inArray(transactions.contactId, dropIds));

		await db
			.update(appointments)
			.set({ clinicContactId: keep_id, clinicName: keepName, updatedAt: new Date() })
			.where(inArray(appointments.clinicContactId, dropIds));

		await db
			.update(appointments)
			.set({ hotelContactId: keep_id, hotelName: keepName, updatedAt: new Date() })
			.where(inArray(appointments.hotelContactId, dropIds));

		await db
			.update(appointments)
			.set({ transferContactId: keep_id, updatedAt: new Date() })
			.where(inArray(appointments.transferContactId, dropIds));

		await db
			.update(patients)
			.set({ contactId: keep_id, updatedAt: new Date() })
			.where(inArray(patients.contactId, dropIds));

		await db.delete(contacts).where(inArray(contacts.id, dropIds));

		await writeAuditLog(db, tenantId, actor, 'update', 'contact', keepName);

		return toContact(updatedKeep!);
	}

	async softDeleteWithDb(db: TenantDb, tenantId: string, id: string, actor: AuditActor) {
		const existing = await this.findRow(db, id);
		if (!existing) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact not found' }
			});
		}
		await db
			.update(contacts)
			.set({ deletedAt: new Date(), updatedAt: new Date() })
			.where(eq(contacts.id, id));
		await writeAuditLog(db, tenantId, actor, 'delete', 'contact', existing.displayName);
		return { id, deleted: true as const };
	}

	private async findRow(db: TenantDb, id: string) {
		const [row] = await db
			.select()
			.from(contacts)
			.where(and(eq(contacts.id, id), isNull(contacts.deletedAt)))
			.limit(1);
		return row;
	}

	private async requireContactTypeName(db: TenantDb, contactTypeId: string) {
		const [type] = await db
			.select({ name: contactTypes.name })
			.from(contactTypes)
			.where(eq(contactTypes.id, contactTypeId))
			.limit(1);
		if (!type) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Contact type not found' }
			});
		}
		return type.name;
	}
}
