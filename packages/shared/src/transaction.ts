import { z } from 'zod';
import { currencyCode, isoDate, isoDateTime, moneyMinor, uuid } from './common.js';

/**
 * Amounts are minor units (integer). Legacy used Decimal — corrected here per AGENTS.md.
 */
export const transactionKindSchema = z.enum(['income', 'expense']);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

export const transactionStatusSchema = z.enum(['paid', 'partial', 'unpaid']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const invoiceStatusSchema = z.enum(['none', 'issued', 'not_issued']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const transactionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	kind: transactionKindSchema,
	title: z.string().min(1).max(255),
	subtitle: z.string().max(255).nullable(),
	category: z.string().max(128).nullable(),
	occurred_on: isoDate,
	status: transactionStatusSchema,
	invoice_status: invoiceStatusSchema.default('none'),
	payment_method: z.string().max(64).nullable(),
	amount: moneyMinor.positive(),
	paid_amount: moneyMinor.nonnegative().nullable(),
	currency: currencyCode.default('TRY'),
	patient_id: uuid.nullable(),
	patient_display_name: z.string().max(255).nullable(),
	contact_label: z.string().max(255).nullable(),
	description: z.string().max(8000).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Transaction = z.infer<typeof transactionSchema>;

export const transactionCreateSchema = transactionSchema.omit({
	id: true,
	tenant_id: true,
	patient_display_name: true,
	created_at: true,
	updated_at: true
});

export type TransactionCreate = z.infer<typeof transactionCreateSchema>;

export const transactionUpdateSchema = transactionCreateSchema.partial();

export type TransactionUpdate = z.infer<typeof transactionUpdateSchema>;
