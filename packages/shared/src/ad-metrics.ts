import { z } from 'zod';
import { isoDate, moneyMinor } from './common.js';

export const adProviderSchema = z.enum(['meta', 'google']);
export type AdProvider = z.infer<typeof adProviderSchema>;

export const adMetricSchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid(),
	provider: adProviderSchema,
	date: isoDate,
	campaign_id: z.string(),
	spend_minor: moneyMinor,
	impressions: z.number().int(),
	clicks: z.number().int()
});
export type AdMetric = z.infer<typeof adMetricSchema>;

export const adMetricsListParams = z.object({
	from: isoDate.optional(),
	to: isoDate.optional(),
	provider: adProviderSchema.optional()
});
export type AdMetricsListParams = z.infer<typeof adMetricsListParams>;
