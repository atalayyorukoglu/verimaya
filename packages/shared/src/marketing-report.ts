import { z } from 'zod';
import { adProviderSchema, type AdProvider } from './ad-metrics.js';
import { isoDate, moneyMinor } from './common.js';
import { reportPeriodSchema } from './reports.js';

export const marketingReportParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional(),
	provider: adProviderSchema.optional()
});
export type MarketingReportParams = z.infer<typeof marketingReportParams>;

export const marketingSourceRow = z.object({
	source: z.string(),
	leads: z.number().int().nonnegative(),
	treated: z.number().int().nonnegative(),
	revenue_base: moneyMinor
});
export type MarketingSourceRow = z.infer<typeof marketingSourceRow>;

/** Requested period plus the window actually applied to spend/tahsilat. */
export const marketingReportPeriodSchema = reportPeriodSchema.extend({
	/** Window used for spend + tahsilat (ad_metrics MIN/MAX when from/to omitted). */
	effective_from: isoDate.nullable(),
	effective_to: isoDate.nullable()
});
export type MarketingReportPeriod = z.infer<typeof marketingReportPeriodSchema>;

export const marketingReportSchema = z.object({
	period: marketingReportPeriodSchema,
	/** Sum of ad spend resolved to tenant base; null when any row lacks FX. */
	spend_base: moneyMinor.nullable(),
	revenue_base: moneyMinor,
	real_roas: z.number().nullable(),
	leads_count: z.number().int().nonnegative(),
	treated_count: z.number().int().nonnegative(),
	cost_per_lead: moneyMinor.nullable(),
	cost_per_treated: moneyMinor.nullable(),
	/** True when at least one spend row cannot be converted to tenant base. */
	spend_fx_missing: z.boolean(),
	/**
	 * True when by_source is non-empty and every row is source "Bilinmeyen"
	 * (patients have no attribution). ROAS/CPL/CPT are withheld.
	 */
	attribution_missing: z.boolean(),
	by_source: z.array(marketingSourceRow)
});
export type MarketingReport = z.infer<typeof marketingReportSchema>;

/** Build marketing report URL (path + query only, no origin). */
export function marketingReportUrl(params?: {
	from?: string | null;
	to?: string | null;
	provider?: AdProvider | null;
}): string {
	const url = new URL('/v1/reports/marketing', 'http://local');
	if (params?.from) url.searchParams.set('from', params.from);
	if (params?.to) url.searchParams.set('to', params.to);
	if (params?.provider) url.searchParams.set('provider', params.provider);
	return `${url.pathname}${url.search}`;
}
