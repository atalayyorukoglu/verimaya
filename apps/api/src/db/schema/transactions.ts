import type { TransactionEvidence } from '@verimaya/shared';
import {
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uuid
} from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { inboundMessages } from './inbound-messages';
import { tenants } from './tenants';

export const transactions = pgTable(
	'transactions',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'restrict' }),
		kind: text('kind').notNull(),
		title: text('title'),
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
		contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
		contactDisplayName: text('contact_display_name'),
		contactLabel: text('contact_label'),
		caseContactId: uuid('case_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		responsibleContactId: uuid('responsible_contact_id').references(() => contacts.id, {
			onDelete: 'set null'
		}),
		description: text('description'),
		/**
		 * AI-09 — satırın çıktığı WhatsApp mesajı. Yalnız sunucu doldurur
		 * (onay akışı); `TransactionCreate` şemasında karşılığı yoktur.
		 */
		sourceInboundMessageId: uuid('source_inbound_message_id').references(
			() => inboundMessages.id,
			{ onDelete: 'set null' }
		),
		/** AI-09 — alan başına doğrulanmış kaynak izi (`TransactionEvidence`). */
		sourceEvidence: jsonb('source_evidence').$type<TransactionEvidence>(),
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
		index('transactions_tenant_id_deleted_at_idx').on(table.tenantId, table.deletedAt),
		index('transactions_tenant_id_occurred_on_idx').on(table.tenantId, table.occurredOn),
		index('transactions_tenant_occurred_on_id_idx').on(
			table.tenantId,
			table.occurredOn,
			table.id
		),
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
		index('transactions_tenant_id_case_contact_id_idx').on(table.tenantId, table.caseContactId),
		index('transactions_tenant_id_responsible_contact_id_idx').on(
			table.tenantId,
			table.responsibleContactId
		),
		index('transactions_tenant_source_msg_idx').on(
			table.tenantId,
			table.sourceInboundMessageId
		)
	]
);

export type TransactionRow = typeof transactions.$inferSelect;
export type NewTransactionRow = typeof transactions.$inferInsert;
