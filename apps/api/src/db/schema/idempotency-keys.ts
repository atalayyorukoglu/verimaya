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
		path: text('path').notNull(),
		statusCode: integer('status_code').notNull(),
		responseBody: jsonb('response_body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		uniqueIndex('idempotency_keys_tenant_key_uidx').on(table.tenantId, table.key),
		index('idempotency_keys_tenant_id_idx').on(table.tenantId)
	]
);

export type IdempotencyKeyRow = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKeyRow = typeof idempotencyKeys.$inferInsert;
