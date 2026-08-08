import { z } from 'zod';
import {
	isoDate,
	isoDateTime,
	moneyMinor,
	supportedCurrencySchema,
	uuid
} from './common.js';

/**
 * Amounts are minor units (integer). Legacy used Decimal — corrected here per AGENTS.md.
 *
 * FX: foreign rows store an immutable snapshot `amount_base` in `base_currency`
 * (tenant base at booking time). Reports convert via snapshot — not live rates.
 */
export const transactionKindSchema = z.enum(['income', 'expense']);
export type TransactionKind = z.infer<typeof transactionKindSchema>;

export const transactionStatusSchema = z.enum(['paid', 'partial', 'unpaid']);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

/**
 * Collected amount in the transaction's native currency (minor units).
 *
 * Tracker model (legacy ETL): `paid` means fully paid — `paid_amount` is often
 * NULL. `paid_amount` is only required for `partial`. Callers in API/web must
 * use this helper; do not use `paid_amount ?? 0`.
 */
export function resolveCollectedAmount(input: {
	status: TransactionStatus | string;
	amount: number;
	paidAmount: number | null;
}): number {
	if (input.status === 'unpaid') return 0;
	if (input.status === 'partial') return input.paidAmount ?? 0;
	// paid — and defensive fallback for unknown status
	return input.paidAmount ?? input.amount;
}

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
	currency: supportedCurrencySchema.default('TRY'),
	/**
	 * Amount in `base_currency` (minor units) at booking time.
	 * Required when `currency` ≠ tenant base; equals `amount` when same currency.
	 */
	amount_base: moneyMinor.nonnegative().nullable().default(null),
	/** Snapshot of tenant base currency when amount_base was set */
	base_currency: supportedCurrencySchema.nullable().default(null),
	/** 1 unit of `currency` (major) = fx_rate units of base (major). Optional audit. */
	fx_rate: z.number().positive().nullable().default(null),
	fx_dated: isoDate.nullable().default(null),
	patient_id: uuid.nullable(),
	patient_display_name: z.string().max(255).nullable(),
	/** Directory counterparty; contact_label kept as denormalized display */
	contact_id: uuid.nullable().default(null),
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
