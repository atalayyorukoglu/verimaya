import { z } from 'zod';

export const ghlConnectionStatus = z.object({
	connected: z.boolean(),
	key_version: z.number().int().nullable(),
	location_id: z.string().nullable(),
	user_type: z.enum(['Location', 'Company']).nullable()
});
export type GhlConnectionStatus = z.infer<typeof ghlConnectionStatus>;

export const ghlOAuthCallbackQuery = z.object({
	code: z.string().min(1),
	state: z.string().min(1)
});
export type GhlOAuthCallbackQuery = z.infer<typeof ghlOAuthCallbackQuery>;
