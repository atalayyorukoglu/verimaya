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
	closed: z.number().int().nonnegative(),
	revenue_base: moneyMinor
});
export type MarketingSourceRow = z.infer<typeof marketingSourceRow>;

export const marketingReportSchema = z.object({
	period: reportPeriodSchema,
	spend_base: moneyMinor,
	revenue_base: moneyMinor,
	real_roas: z.number().nullable(),
	leads_count: z.number().int().nonnegative(),
	closed_count: z.number().int().nonnegative(),
	cost_per_lead: moneyMinor.nullable(),
	cost_per_closed: moneyMinor.nullable(),
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
