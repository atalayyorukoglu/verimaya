import { z } from 'zod';
import { isoDate, supportedCurrencySchema } from './common.js';

/** Query for GET /v1/fx/rate — calendar date in `on` (clamped to today server-side). */
export const fxRateQuerySchema = z.object({
	from: supportedCurrencySchema,
	to: supportedCurrencySchema,
	on: isoDate
});

export type FxRateQuery = z.infer<typeof fxRateQuerySchema>;

/**
 * FX rate snapshot. `date` is the provider's rate day (may be earlier than
 * requested `on` on weekends/holidays — ECB does not publish those days).
 */
export const fxRateResponseSchema = z.object({
	from: supportedCurrencySchema,
	to: supportedCurrencySchema,
	rate: z.number().positive(),
	date: isoDate,
	provider: z.literal('frankfurter'),
	/** True when served from fx_rates cache (no provider round-trip). */
	cached: z.boolean()
});

export type FxRateResponse = z.infer<typeof fxRateResponseSchema>;
