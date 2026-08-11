import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { organization } from './auth';

/**
 * Domain tenant row — PK shared with better-auth `organization.id`.
 * Created in organization.afterCreate hook.
 *
 * AUDIT-F09-06: soft-delete via `deletedAt`; child FKs are ON DELETE restrict so a
 * tenant with business data cannot be hard-deleted (financial retention).
 */
export const tenants = pgTable(
	'tenants',
	{
		id: uuid('id')
			.primaryKey()
			.references(() => organization.id, { onDelete: 'restrict' }),
		name: text('name').notNull(),
		slug: text('slug').notNull(),
		baseCurrency: text('base_currency').notNull().default('TRY'),
		contactsSectionLabel: text('contacts_section_label').notNull().default('Hastalar'),
		timezone: text('timezone').notNull().default('Europe/Istanbul'),
		/** AUDIT-F09-07 — optional legal retention horizon; null = unset. */
		dataRetentionUntil: timestamp('data_retention_until', { withTimezone: true, mode: 'date' }),
		/** AUDIT-F09-06 — soft-delete; hard DELETE blocked by restrict FKs when children exist. */
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [uniqueIndex('tenants_slug_uidx').on(table.slug)]
);

export type TenantRow = typeof tenants.$inferSelect;
export type NewTenantRow = typeof tenants.$inferInsert;

/**
 * Minimal tenant-scoped table for RLS isolation tests (Faz 0b).
 */
export const demoNotes = pgTable(
	'demo_notes',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [index('demo_notes_tenant_id_idx').on(table.tenantId)]
);

export type DemoNoteRow = typeof demoNotes.$inferSelect;
