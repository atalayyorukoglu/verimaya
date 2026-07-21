import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { appointments } from './appointments';
import { createdAt } from './helpers';
import { patients } from './patients';
import { tenants } from './tenants';

export const files = pgTable(
	'files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		patientId: uuid('patient_id')
			.notNull()
			.references(() => patients.id, { onDelete: 'cascade' }),
		appointmentId: uuid('appointment_id').references(() => appointments.id, {
			onDelete: 'set null'
		}),
		appointmentLabel: text('appointment_label'),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull().default('application/octet-stream'),
		sizeBytes: integer('size_bytes').notNull(),
		/** Object storage key — not exposed in API contract */
		storageKey: text('storage_key').notNull(),
		uploadedByUserId: uuid('uploaded_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		uploadedByDisplayName: text('uploaded_by_display_name'),
		createdAt: createdAt()
	},
	(table) => [
		index('files_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('files_tenant_id_patient_id_created_at_idx').on(
			table.tenantId,
			table.patientId,
			table.createdAt
		)
	]
);

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
