import { type AnyPgColumn, boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { contactTypes } from './contact-types';
import { organizations } from './organizations';
import { tenants } from './tenants';

export const contacts = pgTable(
	'contacts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		contactTypeId: uuid('contact_type_id')
			.notNull()
			.references(() => contactTypes.id, { onDelete: 'restrict' }),
		contactTypeName: text('contact_type_name').notNull(),
		firstName: text('first_name'),
		lastName: text('last_name'),
		displayName: text('display_name').notNull(),
		phone: text('phone'),
		email: text('email'),
		notes: text('notes'),
		organizationId: uuid('organization_id').references(() => organizations.id, {
			onDelete: 'set null'
		}),
		status: text('status'),
		assignedUserId: uuid('assigned_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		source: text('source'),
		medium: text('medium'),
		campaign: text('campaign'),
		referredByContactId: uuid('referred_by_contact_id').references((): AnyPgColumn => contacts.id, {
			onDelete: 'set null'
		}),
		isInternal: boolean('is_internal').notNull().default(false),
		usageCount: integer('usage_count').notNull().default(0),
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date())
	},
	(table) => [
		index('contacts_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('contacts_tenant_id_contact_type_id_idx').on(table.tenantId, table.contactTypeId),
		index('contacts_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt),
		index('contacts_tenant_referred_by_idx').on(table.tenantId, table.referredByContactId),
		index('contacts_tenant_status_updated_at_idx').on(
			table.tenantId,
			table.status,
			table.updatedAt
		)
	]
);

export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;
