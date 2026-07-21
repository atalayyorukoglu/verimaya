import { z } from 'zod';
import { isoDate, moneyMinor } from './common.js';

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
	transaction_count: z.number().int().nonnegative()
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;

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

/** Build a report URL (path + query only, no origin). */
export function reportUrl(
	path: 'summary' | 'by-category',
	params?: { from?: string | null; to?: string | null }
): string {
	const url = new URL(`/v1/reports/${path}`, 'http://local');
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	return `${url.pathname}${url.search}`;
}
