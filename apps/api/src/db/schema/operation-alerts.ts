import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appointments } from './appointments';
import { tenants } from './tenants';

export const operationAlerts = pgTable(
	'operation_alerts',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		appointmentId: uuid('appointment_id')
			.notNull()
			.references(() => appointments.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
		thresholdHours: integer('threshold_hours').notNull(),
		confirmedAt: timestamp('confirmed_at', { withTimezone: true, mode: 'date' }),
		confirmedBy: text('confirmed_by'),
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
		index('operation_alerts_tenant_id_due_at_idx').on(table.tenantId, table.dueAt),
		index('operation_alerts_tenant_id_appointment_id_idx').on(
			table.tenantId,
			table.appointmentId
		),
		index('operation_alerts_tenant_id_confirmed_at_idx').on(table.tenantId, table.confirmedAt),
		uniqueIndex('operation_alerts_tenant_appointment_kind_uidx')
			.on(table.tenantId, table.appointmentId, table.kind)
			.where(sql`${table.deletedAt} is null`)
	]
);

export type OperationAlertRow = typeof operationAlerts.$inferSelect;
export type NewOperationAlertRow = typeof operationAlerts.$inferInsert;
