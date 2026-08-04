import { customType, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { createdAt, updatedAt } from './helpers';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

/**
 * Per-tenant per-provider webhook signing identity.
 *
 * Mirrors `tenant_credentials` shape (ciphertext + key_hash + key_version) so the
 * existing CryptoService (AES-256-GCM) encrypts the secret at rest and a SHA-256
 * hash supports constant-time lookup without exposing the plaintext. Inbound webhook
 * signature verification (`apps/api/src/webhooks/webhooks.controller.ts`) calls
 * `app.lookup_tenant_provider_identity(provider, key_hash)` to resolve which tenant
 * the request is for — the resolved tenant_id, not the client header, is canonical.
 *
 * One row per (tenant, provider); rotation is "write new, point lookups at most recent"
 * because `lookup_tenant_provider_identity` orders by `updated_at DESC`.
 */
export const tenantProviderIdentities = pgTable(
	'tenant_provider_identities',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		ciphertext: bytea('ciphertext').notNull(),
		keyHash: text('key_hash').notNull(),
		keyVersion: integer('key_version').notNull().default(1),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(table) => [
		uniqueIndex('tenant_provider_identities_tenant_provider_uidx').on(
			table.tenantId,
			table.provider
		)
	]
);

export type TenantProviderIdentityRow = typeof tenantProviderIdentities.$inferSelect;
export type NewTenantProviderIdentityRow = typeof tenantProviderIdentities.$inferInsert;