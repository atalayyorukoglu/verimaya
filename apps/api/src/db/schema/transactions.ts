import { date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { patients } from './patients';
import { tenants } from './tenants';

export const transactions = pgTable(
	'transactions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		subtitle: text('subtitle'),
		category: text('category'),
		occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
		status: text('status').notNull(),
		invoiceStatus: text('invoice_status').notNull().default('none'),
		paymentMethod: text('payment_method'),
		amount: integer('amount').notNull(),
		paidAmount: integer('paid_amount'),
		currency: text('currency').notNull().default('TRY'),
		amountBase: integer('amount_base'),
		baseCurrency: text('base_currency'),
		fxRate: numeric('fx_rate', { precision: 18, scale: 8, mode: 'number' }),
		fxDated: date('fx_dated', { mode: 'string' }),
		patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'set null' }),
		patientDisplayName: text('patient_display_name'),
		contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
		contactLabel: text('contact_label'),
		description: text('description'),
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
		index('transactions_tenant_id_created_at_idx').on(table.tenantId, table.createdAt),
		index('transactions_tenant_id_occurred_on_idx').on(table.tenantId, table.occurredOn),
		// List + cursor: occurred_on DESC, id DESC (PILOT-01 / ETL-friendly).
		index('transactions_tenant_occurred_on_id_idx').on(
			table.tenantId,
			table.occurredOn,
			table.id
		),
		index('transactions_tenant_id_patient_id_created_at_idx').on(
			table.tenantId,
			table.patientId,
			table.createdAt
		),
		index('transactions_tenant_patient_occurred_on_id_idx').on(
			table.tenantId,
			table.patientId,
			table.occurredOn,
			table.id
		),
		// CONTRACT-01 (Faz 2.1): contact_id is now a real list filter (contacts/[id] page).
		index('transactions_tenant_id_contact_id_created_at_idx').on(
			table.tenantId,
			table.contactId,
			table.createdAt
		),
		index('transactions_tenant_contact_occurred_on_id_idx').on(
			table.tenantId,
			table.contactId,
			table.occurredOn,
			table.id
		),
		index('transactions_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt)
	]
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
