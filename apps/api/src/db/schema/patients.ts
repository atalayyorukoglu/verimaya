import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { tenants } from './tenants';
import { user } from './auth';

export const patients = pgTable(
	'patients',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		fullName: text('full_name').notNull(),
		phone: text('phone'),
		email: text('email'),
		status: text('status').notNull().default('scheduled'),
		source: text('source'),
		notes: text('notes'),
		assignedUserId: uuid('assigned_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
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
		index('patients_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('patients_tenant_id_status_updated_at_idx').on(
			table.tenantId,
			table.status,
			table.updatedAt
		),
		index('patients_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt)
	]
);

export type PatientRow = typeof patients.$inferSelect;
export type NewPatientRow = typeof patients.$inferInsert;
