import {
	boolean,
	pgTable,
	text,
	uniqueIndex,
	uuid,
	check
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { createdUpdated } from './helpers';

/**
 * G-11 — tenant-scoped permission denials layered on code defaults.
 * Rows only store `allowed = false` (CHECK). Privilege escalation is impossible
 * by schema; the application also rejects denies outside the code default.
 */
export const tenantPermissionOverrides = pgTable(
	'tenant_permission_overrides',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		role: text('role').notNull(),
		resource: text('resource').notNull(),
		action: text('action').notNull(),
		/** Always false — column kept for clarity / future product change. */
		allowed: boolean('allowed').notNull().default(false),
		...createdUpdated()
	},
	(table) => [
		uniqueIndex('tenant_permission_overrides_tenant_role_resource_action_uidx').on(
			table.tenantId,
			table.role,
			table.resource,
			table.action
		),
		check('tenant_permission_overrides_allowed_deny_only', sql`${table.allowed} = false`)
	]
);

export type TenantPermissionOverrideRow = typeof tenantPermissionOverrides.$inferSelect;
export type NewTenantPermissionOverrideRow = typeof tenantPermissionOverrides.$inferInsert;
