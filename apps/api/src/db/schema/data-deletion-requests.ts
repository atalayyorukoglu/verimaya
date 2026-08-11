import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { createdAt } from './helpers';
import { tenants } from './tenants';

/**
 * AUDIT-F09-07: KVKK m.11 deletion/anonymization request ledger (panel user subject).
 * Hard-delete of the user row is forbidden — identifying fields are masked instead.
 */
export const dataDeletionRequests = pgTable(
	'data_deletion_requests',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		subjectUserId: uuid('subject_user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'restrict' }),
		status: text('status').notNull(),
		anonymizedAt: timestamp('anonymized_at', { withTimezone: true, mode: 'date' }),
		createdAt: createdAt()
	},
	(table) => [
		index('data_deletion_requests_tenant_subject_created_idx').on(
			table.tenantId,
			table.subjectUserId,
			table.createdAt
		)
	]
);

export type DataDeletionRequestRow = typeof dataDeletionRequests.$inferSelect;
export type NewDataDeletionRequestRow = typeof dataDeletionRequests.$inferInsert;
