import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { ContactCreate, ContactUpdate } from '@verimaya/shared';
import { contactTypes, contacts } from '../db/schema';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toContact } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

@Injectable()
export class ContactsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				contacts.createdAt,
				contacts.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(contacts)
				.where(cursorCond)
				.orderBy(desc(contacts.createdAt), desc(contacts.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toContact),
				next_cursor: page.next_cursor
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

	private async findRow(db: TenantDb, id: string) {
		const [row] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
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
