import {
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

/** Root tenant row — not RLS-scoped; membership/domain tables are. */
export const tenants = pgTable(
	'tenants',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		baseCurrency: text('base_currency').notNull().default('TRY'),
		patientsSectionLabel: text('patients_section_label').notNull().default('Hastalar'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [uniqueIndex('tenants_slug_uidx').on(table.slug)]
);

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;
