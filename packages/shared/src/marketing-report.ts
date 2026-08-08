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

/**
 * Share of cohort patients that must have a non-empty `source` before ROAS/CPL/CPT
 * are published. Below this, revenue attributed by source materially understates
 * ROAS, so the ratio metrics must stay null (OPS-02c/02d).
 */
export const ATTRIBUTION_COVERAGE_THRESHOLD = 0.8;

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
	 * Share of cohort patients with a non-empty source (0..1).
	 * Null when the patient cohort is empty.
	 */
	attribution_coverage: z.number().min(0).max(1).nullable(),
	/**
	 * True when the cohort is non-empty and attribution_coverage is below
	 * ATTRIBUTION_COVERAGE_THRESHOLD. ROAS/CPL/CPT are withheld.
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
