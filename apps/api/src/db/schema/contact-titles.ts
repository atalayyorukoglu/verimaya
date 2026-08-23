import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Ünvan / görev sözlüğü (Hekim, Koordinatör, Reklam Uzmanı, Satış, …).
 * Desen `contact_types` ile birebir aynı — bkz. AGENTS.md "migration kuralları".
 *
 * BAĞLAYICI: ünvan yalnız tanımlayıcı veridir; hiçbir izin kontrolünde okunmaz ve
 * yalnız `contacts` üzerinde yaşar (`user` tablosuna eklenmez).
 */
export const contactTitles = pgTable(
	'contact_titles',
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
		index('contact_titles_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('contact_titles_tenant_id_name_uidx').on(table.tenantId, table.name)
	]
);

export type ContactTitleRow = typeof contactTitles.$inferSelect;
export type NewContactTitleRow = typeof contactTitles.$inferInsert;
