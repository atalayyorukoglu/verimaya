import type { ApiKeyScope } from '@verimaya/shared';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './helpers';
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
		/** AUDIT-F09-02: JSONB array of `resource:action` scope tokens. */
		scopes: jsonb('scopes').$type<ApiKeyScope[]>().notNull(),
		createdAt: createdAt(),
		// AUDIT-03 (Faz 8): `last_used_at` updates on every successful `ApiKeyGuard`
		// lookup so operators can see when a key was last touched (and detect
		// stolen-but-still-valid keys via inactivity). NULL until first use.
		lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
		// AUDIT-03 (Faz 8): explicit expiry. NULL = never expires (legacy keys issued
		// before this migration; flagged for cleanup). New keys default to 90 days
		// from issuance. App.lookup_api_key filters `expires_at > now()`; expired
		// keys reject as if revoked.
		expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
		revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
		updatedAt: updatedAt()
	},
	(table) => [
		index('api_keys_tenant_created_at_idx').on(table.tenantId, table.createdAt),
		index('api_keys_key_hash_idx').on(table.keyHash)
	]
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
