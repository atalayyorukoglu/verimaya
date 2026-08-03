import { z } from 'zod';
import { isoDate, moneyMinor, supportedCurrencySchema, uuid } from './common.js';
import { patientStatusSchema } from './patient.js';

export const reportPeriodParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional()
});
export type ReportPeriodParams = z.infer<typeof reportPeriodParams>;

export const reportPeriodSchema = z.object({
	from: isoDate.nullable(),
	to: isoDate.nullable()
});
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

export const reportSummarySchema = z.object({
	period: reportPeriodSchema,
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	/** Unpaid income in tenant base (income amount − paid, clamped ≥ 0 per row). */
	pending_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

export const reportPatientStatusCountSchema = z.object({
	status: patientStatusSchema,
	count: z.number().int().nonnegative()
});
export type ReportPatientStatusCount = z.infer<typeof reportPatientStatusCountSchema>;

export const reportPatientSourceCountSchema = z.object({
	source: z.string(),
	count: z.number().int().nonnegative()
});
export type ReportPatientSourceCount = z.infer<typeof reportPatientSourceCountSchema>;

export const reportPatientDistributionSchema = z.object({
	period: reportPeriodSchema,
	by_status: z.array(reportPatientStatusCountSchema),
	by_source: z.array(reportPatientSourceCountSchema),
	total: z.number().int().nonnegative()
});
export type ReportPatientDistribution = z.infer<typeof reportPatientDistributionSchema>;

export const reportBalanceRowSchema = z.object({
	contact_id: uuid,
	contact_label: z.string(),
	currency: supportedCurrencySchema,
	/** Signed open balance: income positive, expense negative. */
	open_amount: moneyMinor,
	/** Signed collected amount: income positive, expense negative. */
	collected_amount: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportBalanceRow = z.infer<typeof reportBalanceRowSchema>;

export const reportBalancesSchema = z.object({
	items: z.array(reportBalanceRowSchema)
});
export type ReportBalances = z.infer<typeof reportBalancesSchema>;

export const reportCategoryRowSchema = z.object({
	category_name: z.string(),
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportCategoryRow = z.infer<typeof reportCategoryRowSchema>;

export const reportByCategorySchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportCategoryRowSchema)
});
export type ReportByCategory = z.infer<typeof reportByCategorySchema>;

export const reportByCategoryDetailParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional(),
	category: z.string().trim().min(1).max(255)
});
export type ReportByCategoryDetailParams = z.infer<typeof reportByCategoryDetailParams>;

export const reportSubtitleRowSchema = z.object({
	subtitle_name: z.string(),
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportSubtitleRow = z.infer<typeof reportSubtitleRowSchema>;

export const reportByCategoryDetailSchema = z.object({
	period: reportPeriodSchema,
	category: z.string(),
	items: z.array(reportSubtitleRowSchema)
});
export type ReportByCategoryDetail = z.infer<typeof reportByCategoryDetailSchema>;

/** `YYYY-MM` bucket key. */
export const reportMonthKey = z.string().regex(/^\d{4}-\d{2}$/);

export const reportMonthRowSchema = z.object({
	month: reportMonthKey,
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});
export type ReportMonthRow = z.infer<typeof reportMonthRowSchema>;

export const reportMonthlySchema = z.object({
	period: reportPeriodSchema,
	items: z.array(reportMonthRowSchema)
});
export type ReportMonthly = z.infer<typeof reportMonthlySchema>;

export type ReportUrlPath =
	| 'summary'
	| 'by-category'
	| 'monthly'
	| 'by-category-detail'
	| 'patient-distribution'
	| 'balances';

/** Build a report URL (path + query only, no origin). */
export function reportUrl(
	path: ReportUrlPath,
	params?: { from?: string | null; to?: string | null; category?: string | null }
): string {
	const url = new URL(`/v1/reports/${path}`, 'http://local');
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.category) url.searchParams.set('category', params.category);
	return `${url.pathname}${url.search}`;
}
