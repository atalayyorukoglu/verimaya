import { date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { tenants } from './tenants';
import { transactions } from './transactions';

export const commissionEntries = pgTable(
	'commission_entries',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		beneficiaryContactId: uuid('beneficiary_contact_id')
			.notNull()
			.references(() => contacts.id, { onDelete: 'cascade' }),
		caseContactId: uuid('case_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		sourceTransactionId: uuid('source_transaction_id').references(() => transactions.id, {
			onDelete: 'set null'
		}),
		amount: integer('amount').notNull(),
		currency: text('currency').notNull(),
		amountBase: integer('amount_base'),
		baseCurrency: text('base_currency'),
		fxRate: numeric('fx_rate', { precision: 18, scale: 8, mode: 'number' }),
		fxDated: date('fx_dated', { mode: 'string' }),
		status: text('status').notNull().default('accrued'),
		earnedOn: date('earned_on', { mode: 'string' }).notNull(),
		paidOn: date('paid_on', { mode: 'string' }),
		note: text('note'),
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
		index('commission_entries_tenant_id_beneficiary_contact_id_idx').on(
			table.tenantId,
			table.beneficiaryContactId
		),
		index('commission_entries_tenant_id_status_idx').on(table.tenantId, table.status),
		index('commission_entries_tenant_id_earned_on_idx').on(table.tenantId, table.earnedOn),
		index('commission_entries_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt)
	]
);

export type CommissionEntryRow = typeof commissionEntries.$inferSelect;
export type NewCommissionEntryRow = typeof commissionEntries.$inferInsert;
