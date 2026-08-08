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

export const reportFxMissingByCurrencySchema = z.object({
	currency: supportedCurrencySchema,
	/** Sum of native-currency amounts (minor) that could not be resolved into tenant base. */
	amount_minor: moneyMinor
});
export type ReportFxMissingByCurrency = z.infer<typeof reportFxMissingByCurrencySchema>;

export const reportSummarySchema = z.object({
	period: reportPeriodSchema,
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	/** Unpaid income in tenant base (income amount − paid, clamped ≥ 0 per row). */
	pending_base: moneyMinor,
	transaction_count: z.number().int().nonnegative(),
	/** Rows with no resolvable amount in tenant base (period-scoped). */
	fx_missing_count: z.number().int().nonnegative(),
	fx_missing_amount_by_currency: z.array(reportFxMissingByCurrencySchema),
	/**
	 * Count-based coverage: (transaction_count − fx_missing_count) / max(transaction_count, 1).
	 * Cross-currency value weights are not comparable without FX.
	 */
	coverage_ratio: z.number().min(0).max(1)
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

/** GAP-07: rates are fractions in [0, 1] (UI formats as percent). Total 0 → rates 0. */
export const reportClinicMetricsRowSchema = z.object({
	clinic_contact_id: uuid.nullable(),
	clinic_name: z.string().min(1).max(255),
	count: z.number().int().nonnegative(),
	completion_rate: z.number().min(0).max(1)
});
export type ReportClinicMetricsRow = z.infer<typeof reportClinicMetricsRowSchema>;

export const reportAppointmentTypeMetricsRowSchema = z.object({
	appointment_type: z.string().min(1).max(128),
	count: z.number().int().nonnegative(),
	ratio: z.number().min(0).max(1)
});
export type ReportAppointmentTypeMetricsRow = z.infer<
	typeof reportAppointmentTypeMetricsRowSchema
>;

export const reportAppointmentMonthRowSchema = z.object({
	month: reportMonthKey,
	count: z.number().int().nonnegative()
});
export type ReportAppointmentMonthRow = z.infer<typeof reportAppointmentMonthRowSchema>;

export const reportAppointmentMetricsSchema = z.object({
	period: reportPeriodSchema,
	total: z.number().int().nonnegative(),
	/** completed ÷ total */
	completion_rate: z.number().min(0).max(1),
	/** no_show ÷ total */
	no_show_rate: z.number().min(0).max(1),
	/** cancelled ÷ total */
	cancellation_rate: z.number().min(0).max(1),
	by_clinic: z.array(reportClinicMetricsRowSchema),
	by_appointment_type: z.array(reportAppointmentTypeMetricsRowSchema),
	monthly: z.array(reportAppointmentMonthRowSchema)
});
export type ReportAppointmentMetrics = z.infer<typeof reportAppointmentMetricsSchema>;

export type ReportUrlPath =
	| 'summary'
	| 'by-category'
	| 'monthly'
	| 'by-category-detail'
	| 'patient-distribution'
	| 'balances'
	| 'appointment-metrics';

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
