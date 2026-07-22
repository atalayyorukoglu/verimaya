import { z } from 'zod';
import { adProviderSchema } from './ad-metrics.js';
import { isoDate } from './common.js';

export const adConnectionStatus = z.object({
	provider: adProviderSchema,
	connected: z.boolean(),
	key_version: z.number().int().nullable(),
	last_sync_date: isoDate.nullable()
});
export type AdConnectionStatus = z.infer<typeof adConnectionStatus>;

export const adConnectionsResponse = z.object({
	items: z.array(adConnectionStatus)
});
export type AdConnectionsResponse = z.infer<typeof adConnectionsResponse>;

export const adOAuthCallbackQuery = z.object({
	code: z.string().min(1),
	state: z.string().min(1)
});
export type AdOAuthCallbackQuery = z.infer<typeof adOAuthCallbackQuery>;
