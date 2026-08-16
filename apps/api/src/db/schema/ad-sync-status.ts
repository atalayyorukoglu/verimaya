import { check, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';
import { timestamptz } from './helpers';

/**
 * OPS-02 hata yüzeyleme — en son ad_metrics.sync denemesinin sonucu, sağlayıcı başına.
 * Tek satır tenant+provider başına (upsert); geçmiş tutulmaz, yalnız "şu an durum ne".
 * `ad_metrics_daily.date` ("veri hangi güne kadar geldi") ile karıştırılmasın — bu tablo
 * "sistem son ne zaman denedi, başardı mı" sorusuna cevap verir.
 */
export const adSyncStatus = pgTable(
	'ad_sync_status',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		status: text('status').notNull(),
		lastError: text('last_error'),
		syncedAt: timestamptz('synced_at').notNull().defaultNow()
	},
	(table) => [
		check('ad_sync_status_provider_check', sql`${table.provider} IN ('meta', 'google')`),
		check('ad_sync_status_status_check', sql`${table.status} IN ('success', 'error')`),
		uniqueIndex('ad_sync_status_tenant_provider_uidx').on(table.tenantId, table.provider)
	]
);

export type AdSyncStatusRow = typeof adSyncStatus.$inferSelect;
export type NewAdSyncStatusRow = typeof adSyncStatus.$inferInsert;
