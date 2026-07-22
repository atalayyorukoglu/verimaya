import { jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { updatedAt } from './helpers';

/** Keyed JSON settings bag per tenant (e.g. key=`trust_score`). */
export const tenantSettings = pgTable(
	'tenant_settings',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		key: text('key').notNull(),
		value: jsonb('value').$type<unknown>().notNull(),
		updatedAt: updatedAt()
	},
	(table) => [uniqueIndex('tenant_settings_tenant_key_uidx').on(table.tenantId, table.key)]
);

export type TenantSettingsRow = typeof tenantSettings.$inferSelect;
export type NewTenantSettingsRow = typeof tenantSettings.$inferInsert;
