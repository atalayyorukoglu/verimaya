import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from './helpers';
import { tenants } from './tenants';

export const apiKeys = pgTable(
	'api_keys',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		keyPrefix: text('key_prefix').notNull(),
		keyHash: text('key_hash').notNull(),
		scopes: text('scopes').array().notNull(),
		createdAt: createdAt(),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' })
	},
	(table) => [
		index('api_keys_tenant_created_at_idx').on(table.tenantId, table.createdAt),
		index('api_keys_key_hash_idx').on(table.keyHash)
	]
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
