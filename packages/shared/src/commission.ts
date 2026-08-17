import { z } from 'zod';
import {
	cursorPageSchema,
	isoDate,
	isoDateTime,
	moneyMinor,
	supportedCurrencySchema,
	uuid
} from './common.js';

/**
 * Commission / hakediş entry — recorded amounts only.
 * No formula: the user enters what was earned; status tracks accrual vs payment.
 */

export const commissionEntryStatusSchema = z.enum(['accrued', 'paid', 'cancelled']);
export type CommissionEntryStatus = z.infer<typeof commissionEntryStatusSchema>;

export const commissionEntrySchema = z.object({
	id: uuid,
	tenant_id: uuid,
	beneficiary_contact_id: uuid,
	beneficiary_display_name: z.string().min(1).max(255),
	case_contact_id: uuid.nullable(),
	case_display_name: z.string().max(255).nullable(),
	source_transaction_id: uuid.nullable(),
	amount: moneyMinor.positive(),
	currency: supportedCurrencySchema,
	amount_base: moneyMinor.nonnegative().nullable(),
	base_currency: supportedCurrencySchema.nullable(),
	fx_rate: z.number().positive().nullable(),
	fx_dated: isoDate.nullable(),
	status: commissionEntryStatusSchema,
	earned_on: isoDate,
	paid_on: isoDate.nullable(),
	note: z.string().max(8000).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type CommissionEntry = z.infer<typeof commissionEntrySchema>;

export const commissionEntryCreateSchema = z
	.object({
		beneficiary_contact_id: uuid,
		case_contact_id: uuid.nullable().optional(),
		source_transaction_id: uuid.nullable().optional(),
		amount: moneyMinor.positive(),
		currency: supportedCurrencySchema.default('TRY'),
		amount_base: moneyMinor.nonnegative().nullable().optional(),
		base_currency: supportedCurrencySchema.nullable().optional(),
		fx_rate: z.number().positive().nullable().optional(),
		fx_dated: isoDate.nullable().optional(),
		status: commissionEntryStatusSchema.optional(),
		earned_on: isoDate,
		paid_on: isoDate.nullable().optional(),
		note: z.string().max(8000).nullable().optional()
	})
	.strict();

export type CommissionEntryCreate = z.infer<typeof commissionEntryCreateSchema>;

export const commissionEntryUpdateSchema = z
	.object({
		status: commissionEntryStatusSchema.optional(),
		paid_on: isoDate.nullable().optional(),
		amount: moneyMinor.positive().optional(),
		note: z.string().max(8000).nullable().optional()
	})
	.strict();

export type CommissionEntryUpdate = z.infer<typeof commissionEntryUpdateSchema>;

export const commissionEntryListPageSchema = cursorPageSchema(commissionEntrySchema);
export type CommissionEntryListPage = z.infer<typeof commissionEntryListPageSchema>;

export const commissionSummaryRowSchema = z.object({
	beneficiary_contact_id: uuid,
	beneficiary_display_name: z.string().min(1).max(255),
	accrued_base: moneyMinor,
	paid_base: moneyMinor,
	/** accrued_base − paid_base; only rows with open_base ≠ 0 are returned. */
	open_base: moneyMinor,
	entry_count: z.number().int().nonnegative()
});

export type CommissionSummaryRow = z.infer<typeof commissionSummaryRowSchema>;

export const commissionSummarySchema = z.object({
	items: z.array(commissionSummaryRowSchema),
	/**
	 * Entries whose FX snapshot could not resolve into tenant base
	 * (excluded from accrued/paid/open totals — not silently dropped).
	 */
	missing_fx_count: z.number().int().nonnegative()
});

export type CommissionSummary = z.infer<typeof commissionSummarySchema>;
