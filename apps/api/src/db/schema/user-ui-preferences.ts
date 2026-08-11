import { jsonb, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createdUpdated } from './helpers';
import { tenants } from './tenants';

/**
 * Per-user + active-organization UI preferences (e.g. enabled product modules).
 * `organization_id` equals the tenant/org id used for RLS (`app.current_tenant_id`).
 * User-row isolation is enforced in the service layer (queries always filter `user_id`);
 * RLS provides organization isolation like other tenant-scoped tables.
 */
export const userUiPreferences = pgTable(
	'user_ui_preferences',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		organizationId: uuid('organization_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		enabledProductModules: jsonb('enabled_product_modules')
			.$type<string[]>()
			.notNull()
			.default([]),
		...createdUpdated()
	},
	(table) => [
		uniqueIndex('user_ui_preferences_user_org_uidx').on(table.userId, table.organizationId)
	]
);

export type UserUiPreferencesRow = typeof userUiPreferences.$inferSelect;
export type NewUserUiPreferencesRow = typeof userUiPreferences.$inferInsert;
