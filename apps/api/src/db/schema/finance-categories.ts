import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdUpdated } from './helpers';
import { tenants } from './tenants';

export const financeCategories = pgTable(
	'finance_categories',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		subcategories: jsonb('subcategories').$type<string[]>().notNull().default([]),
		...createdUpdated()
	},
	(table) => [
		index('finance_categories_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('finance_categories_tenant_kind_name_uidx').on(
			table.tenantId,
			table.kind,
			table.name
		)
	]
);

export type FinanceCategoryRow = typeof financeCategories.$inferSelect;
export type NewFinanceCategoryRow = typeof financeCategories.$inferInsert;
