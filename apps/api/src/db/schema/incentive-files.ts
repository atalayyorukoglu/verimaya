import { date, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { IncentiveDocumentItem } from '@verimaya/shared';
import { contacts } from './contacts';
import { tenants } from './tenants';
import { transactions } from './transactions';

export const incentiveFiles = pgTable(
	'incentive_files',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		contactId: uuid('contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		contactDisplayName: text('contact_display_name').notNull(),
		transactionId: uuid('transaction_id').references(() => transactions.id, {
			onDelete: 'set null'
		}),
		paymentDate: date('payment_date', { mode: 'string' }).notNull(),
		deadlineAt: date('deadline_at', { mode: 'string' }).notNull(),
		status: text('status').notNull().default('open'),
		submittedAt: date('submitted_at', { mode: 'string' }),
		note: text('note'),
		documents: jsonb('documents').$type<IncentiveDocumentItem[]>().notNull().default([]),
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
		index('incentive_files_tenant_id_deadline_at_idx').on(table.tenantId, table.deadlineAt),
		index('incentive_files_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt),
		index('incentive_files_tenant_id_status_idx').on(table.tenantId, table.status),
		index('incentive_files_tenant_id_contact_id_idx').on(table.tenantId, table.contactId)
	]
);

export type IncentiveFileRow = typeof incentiveFiles.$inferSelect;
export type NewIncentiveFileRow = typeof incentiveFiles.$inferInsert;
