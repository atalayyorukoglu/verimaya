import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

/**
 * Legacy / integration id ↔ Verimaya UUID map (ETL idempotency, Adım 27).
 * `source`: legacy_tracker | ghl | …
 * `entity_type`: contact | appointment | transaction | file
 * `internal_id` is polymorphic (no FK) — points at the Verimaya row UUID.
 */
export const externalIds = pgTable(
	'external_ids',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		source: text('source').notNull(),
		entityType: text('entity_type').notNull(),
		externalId: text('external_id').notNull(),
		internalId: uuid('internal_id').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('external_ids_tenant_source_entity_external_uidx').on(
			table.tenantId,
			table.source,
			table.entityType,
			table.externalId
		),
		index('external_ids_tenant_entity_internal_idx').on(
			table.tenantId,
			table.entityType,
			table.internalId
		)
	]
);

export type ExternalIdRow = typeof externalIds.$inferSelect;
export type NewExternalIdRow = typeof externalIds.$inferInsert;
