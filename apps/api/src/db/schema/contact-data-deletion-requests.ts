import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { createdAt } from './helpers';
import { tenants } from './tenants';

/**
 * AUDIT-F09-07b: KVKK m.11 deletion/anonymization request ledger (contact subject).
 * Hard-delete of the contact row is forbidden — identifying fields are masked instead.
 * Financial rows keep contact_id; soft-delete (deleted_at) is orthogonal.
 */
export const contactDataDeletionRequests = pgTable(
	'contact_data_deletion_requests',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		subjectContactId: uuid('subject_contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'restrict' }),
		status: text('status').notNull(),
		anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'date' }),
		createdAt: createdAt()
	},
	(table) => [
		index('contact_data_deletion_requests_tenant_subject_created_idx').on(
			table.tenantId,
			table.subjectContactId,
			table.createdAt
		)
	]
);

export type ContactDataDeletionRequestRow = typeof contactDataDeletionRequests.$inferSelect;
export type NewContactDataDeletionRequestRow = typeof contactDataDeletionRequests.$inferInsert;
