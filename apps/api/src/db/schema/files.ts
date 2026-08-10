import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { appointments } from './appointments';
import { contacts } from './contacts';
import { createdAt } from './helpers';
import { tenants } from './tenants';

export const files = pgTable(
	'files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		appointmentId: uuid('appointment_id').references(() => appointments.id, {
			onDelete: 'set null'
		}),
		appointmentLabel: text('appointment_label'),
		filename: text('filename').notNull(),
		mimeType: text('mime_type').notNull().default('application/octet-stream'),
		sizeBytes: integer('size_bytes').notNull(),
		/** pending = presigned/not confirmed; ready = bytes verified */
		status: text('status').notNull().default('ready'),
		/** Object storage key — not exposed in API contract */
		storageKey: text('storage_key').notNull(),
		uploadedByUserId: uuid('uploaded_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		uploadedByDisplayName: text('uploaded_by_display_name'),
		/** GAP-F09-23: soft-delete; list/preview hide; blob kept for sweep/retention */
		deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
		createdAt: createdAt()
	},
	(table) => [
		index('files_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('files_tenant_id_contact_id_created_at_idx').on(
			table.tenantId,
			table.contactId,
			table.createdAt
		),
		index('files_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt)
	]
);

export type FileRow = typeof files.$inferSelect;
export type NewFileRow = typeof files.$inferInsert;
