import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const contactTypes = pgTable(
	'contact_types',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('contact_types_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('contact_types_tenant_id_name_uidx').on(table.tenantId, table.name)
	]
);

export type ContactTypeRow = typeof contactTypes.$inferSelect;
export type NewContactTypeRow = typeof contactTypes.$inferInsert;
