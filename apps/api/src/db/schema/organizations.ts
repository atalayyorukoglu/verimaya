import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Firm dictionary (§0-A / DOMAIN-02): clinic/hotel/agency names selectable on contacts.
 * Same tenant dictionary pattern as contact_types / appointment_types + soft-delete.
 * Unique is partial (deleted_at IS NULL) so soft-deleted names can be reused as new rows.
 */
export const organizations = pgTable(
	'organizations',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		uniqueIndex('organizations_tenant_id_name_uidx')
			.on(table.tenantId, table.name)
			.where(sql`${table.deletedAt} is null`),
		index('organizations_tenant_id_created_at_idx').on(table.tenantId, table.createdAt)
	]
);

export type OrganizationRow = typeof organizations.$inferSelect;
export type NewOrganizationRow = typeof organizations.$inferInsert;
