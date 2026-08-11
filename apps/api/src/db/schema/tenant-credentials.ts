import { customType, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { createdAt } from './helpers';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

/** Per-tenant OAuth/API credentials (ciphertext only; never plaintext at rest). */
export const tenantCredentials = pgTable(
	'tenant_credentials',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		provider: text('provider').notNull(),
		ciphertext: bytea('ciphertext').notNull(),
		keyVersion: integer('key_version').notNull().default(1),
		createdAt: createdAt()
	},
	(table) => [uniqueIndex('tenant_credentials_tenant_provider_uidx').on(table.tenantId, table.provider)]
);

export type TenantCredentialRow = typeof tenantCredentials.$inferSelect;
export type NewTenantCredentialRow = typeof tenantCredentials.$inferInsert;
