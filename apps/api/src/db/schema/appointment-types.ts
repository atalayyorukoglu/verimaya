import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';

export const appointmentTypes = pgTable(
	'appointment_types',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
			.notNull()
			.defaultNow()
	},
	(table) => [
		index('appointment_types_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		uniqueIndex('appointment_types_tenant_id_name_uidx').on(table.tenantId, table.name)
	]
);

export type AppointmentTypeRow = typeof appointmentTypes.$inferSelect;
export type NewAppointmentTypeRow = typeof appointmentTypes.$inferInsert;
