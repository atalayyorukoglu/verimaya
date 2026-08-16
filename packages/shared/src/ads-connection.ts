import { z } from 'zod';
import { adProviderSchema } from './ad-metrics.js';
import { isoDate, isoDateTime } from './common.js';

/** OPS-02 hata yüzeyleme: en son `ad_metrics.sync` denemesinin sonucu. */
export const adSyncStatusValue = z.enum(['success', 'error']);
export type AdSyncStatusValue = z.infer<typeof adSyncStatusValue>;

export const adConnectionStatus = z.object({
	provider: adProviderSchema,
	connected: z.boolean(),
	key_version: z.number().int().nullable(),
	last_sync_date: isoDate.nullable(),
	/** Google Ads client customer id (digits); null for Meta / unset. */
	customer_id: z.string().nullable(),
	/** Son senkron denemesinin zamanı — henüz hiç denenmediyse null. */
	last_synced_at: isoDateTime.nullable(),
	/** Son senkron denemesinin sonucu — henüz hiç denenmediyse null. */
	last_sync_status: adSyncStatusValue.nullable()
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

/** Tenant sets the Google Ads client account to pull (MCC OAuth + client id). */
export const adGoogleCustomerIdUpdate = z.object({
	customer_id: z
		.string()
		.trim()
		.transform((s) => s.replace(/\D/g, ''))
		.pipe(z.string().min(6).max(16))
});
export type AdGoogleCustomerIdUpdate = z.infer<typeof adGoogleCustomerIdUpdate>;
