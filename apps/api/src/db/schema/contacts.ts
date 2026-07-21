import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contactTypes } from './contact-types';
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
		displayName: text('display_name').notNull(),
		phone: text('phone'),
		email: text('email'),
		notes: text('notes'),
		isInternal: boolean('is_internal').notNull().default(false),
		usageCount: integer('usage_count').notNull().default(0),
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
		index('contacts_tenant_id_contact_type_id_idx').on(table.tenantId, table.contactTypeId)
	]
);

export type ContactRow = typeof contacts.$inferSelect;
export type NewContactRow = typeof contacts.$inferInsert;
