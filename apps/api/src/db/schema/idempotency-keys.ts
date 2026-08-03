import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const idempotencyKeys = pgTable(
	'idempotency_keys',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		method: text('method').notNull(),
		/**
		 * IDEM-01 (Faz 4.1): route *template*, not the resolved path (e.g. `/v1/patients/:id`,
		 * never `/v1/patients/<uuid>`). Every call site passes a literal template string — see
		 * idempotency.service.ts. This is what makes the identity endpoint-shaped instead of
		 * resource-shaped; callers mint a fresh key per logical action (apps/web `apiSend`), so
		 * two different resources never legitimately share a key.
		 */
		normalizedPath: text('normalized_path').notNull(),
		statusCode: integer('status_code').notNull(),
		responseBody: jsonb('response_body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('idempotency_keys_tenant_key_method_path_uidx').on(
			table.tenantId,
			table.key,
			table.method,
			table.normalizedPath
		),
		index('idempotency_keys_tenant_id_idx').on(table.tenantId)
	]
);

export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKeyRow = typeof idempotencyKeys.$inferInsert;
