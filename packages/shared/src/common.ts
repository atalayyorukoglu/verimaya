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

/** Money in minor units (kuruş/cent). Always integer. */
export const moneyMinor = z.number().int();

export const cursorPageParams = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(100).default(25)
});

export function cursorPageSchema<T extends z.ZodTypeAny>(item: T) {
	return z.object({
		items: z.array(item),
		next_cursor: z.string().nullable()
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
