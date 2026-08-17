import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { appointments } from './appointments';
import { tenants } from './tenants';

export const recordUpdateSuggestions = pgTable(
	'record_update_suggestions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		appointmentId: uuid('appointment_id')
			.notNull()
			.references(() => appointments.id, { onDelete: 'cascade' }),
		field: text('field').notNull(),
		currentValue: timestamp('current_value', { withTimezone: true, mode: 'date' }).notNull(),
		suggestedValue: timestamp('suggested_value', { withTimezone: true, mode: 'date' }).notNull(),
		sourceText: text('source_text').notNull(),
		confidence: text('confidence').notNull(),
		status: text('status').notNull().default('pending'),
		decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
		decidedBy: text('decided_by'),
		rejectReason: text('reject_reason'),
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
		index('record_update_suggestions_tenant_id_status_created_at_idx').on(
			table.tenantId,
			table.status,
			table.createdAt
		),
		index('record_update_suggestions_tenant_id_appointment_id_idx').on(
			table.tenantId,
			table.appointmentId
		),
		uniqueIndex('record_update_suggestions_tenant_appointment_field_pending_uidx')
			.on(table.tenantId, table.appointmentId, table.field)
			.where(sql`${table.status} = 'pending' and ${table.deletedAt} is null`)
	]
);

export type RecordUpdateSuggestionRow = typeof recordUpdateSuggestions.$inferSelect;
export type NewRecordUpdateSuggestionRow = typeof recordUpdateSuggestions.$inferInsert;
