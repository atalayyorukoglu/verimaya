import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

/**
 * Olay türü sözlüğü (Revizyon gerekti, Sonuç beklentinin altında, …).
 * Desen `contact_titles` ile birebir aynı — bkz. AGENTS.md "migration kuralları" —
 * ek olarak `area` kolonu taşır (tür hangi departmana ait).
 *
 * v1: yalnız `clinic` seed edilir, UI yalnız klinik gösterir. Diğer beş alan (hotel/
 * transfer/sales/marketing/coordination) şema düzeyinde açık — genişleme veri
 * değişikliği olsun, şema değişikliği olmasın diye. Bkz.
 * docs/2026-08-23-maya-icgoru-sorulari.md § 5.
 */
export const incidentTypes = pgTable(
	'incident_types',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		area: text('area').notNull(),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('incident_types_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('incident_types_tenant_id_area_name_uidx').on(
			table.tenantId,
			table.area,
			table.name
		),
		check(
			'incident_types_area_chk',
			sql`${table.area} IN ('clinic', 'hotel', 'transfer', 'sales', 'marketing', 'coordination')`
		)
	]
);

export type IncidentTypeRow = typeof incidentTypes.$inferSelect;
export type NewIncidentTypeRow = typeof incidentTypes.$inferInsert;
