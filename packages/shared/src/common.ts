import { z } from 'zod';

/** ISO-8601 UTC datetime string (accepts trailing Z) */
export const isoDateTime = z.string().datetime();

/** Calendar date YYYY-MM-DD */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const uuid = z.string().uuid();

export const currencyCode = z
	.string()
	.length(3)
	.regex(/^[A-Z]{3}$/);

/** Currencies Verimaya supports in UI / tenant base. */
export const supportedCurrencySchema = z.enum(['TRY', 'GBP', 'EUR', 'USD']);
export type SupportedCurrency = z.infer<typeof supportedCurrencySchema>;
export const SUPPORTED_CURRENCIES = supportedCurrencySchema.options;

/** Money in minor units (kuruş/cent). Always integer. */
export const moneyMinor = z.number().int();

export const cursorPageParams = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const searchableListParams = cursorPageParams.extend({
	q: z.string().trim().min(1).max(255).optional()
});

/** Soft-delete success body (list/hide only — row stays in DB). */
export const softDeleteResultSchema = z.object({
	id: uuid,
	deleted: z.literal(true)
});

export type SoftDeleteResult = z.infer<typeof softDeleteResultSchema>;

export function cursorPageSchema<T extends z.ZodTypeAny>(item: T) {
	return z.object({
		items: z.array(item),
		next_cursor: z.string().nullable(),
		/** Opt-in exact total for filter-aware lists (patients, contacts, transactions). */
		total_count: z.number().int().nonnegative().optional()
	});
}

export const apiErrorSchema = z.object({
	error: z.object({
		code: z.string(),
		message: z.string()
	}),
	request_id: z.string()
});

export type ApiError = z.infer<typeof apiErrorSchema>;
