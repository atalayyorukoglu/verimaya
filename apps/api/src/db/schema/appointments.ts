import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { tenants } from './tenants';

export const appointments = pgTable(
	'appointments',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		contactDisplayName: text('contact_display_name').notNull(),
		title: text('title'),
		appointmentType: text('appointment_type'),
		status: text('status').notNull().default('scheduled'),
		startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
		endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }),
		clinicName: text('clinic_name'),
		hotelName: text('hotel_name'),
		transferNote: text('transfer_note'),
		clinicContactId: uuid('clinic_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		hotelContactId: uuid('hotel_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		transferContactId: uuid('transfer_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		notes: text('notes'),
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
		index('appointments_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('appointments_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt),
		index('appointments_tenant_id_starts_at_idx').on(table.tenantId, table.startsAt),
		index('appointments_tenant_id_contact_id_created_at_idx').on(
			table.tenantId,
			table.contactId,
			table.createdAt
		)
	]
);

export type AppointmentRow = typeof appointments.$inferSelect;
export type NewAppointmentRow = typeof appointments.$inferInsert;
