import { check, date, index, integer, numeric, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenants } from './tenants';

export const adMetricsDaily = pgTable(
	'ad_metrics_daily',
	{
		id: uuid('id').defaultRandom().primaryKey(),
		tenantId: uuid('tenant_id')
			.notNull()
			.references(() => tenants.id, { onDelete: 'cascade' }),
		provider: text('provider').notNull(),
		date: date('date', { mode: 'string' }).notNull(),
		campaignId: text('campaign_id').notNull(),
		spendMinor: integer('spend_minor').notNull(),
		/** Account currency from Ads API — never defaulted; NULL = incomplete sync/backfill. */
		currency: text('currency'),
		spendBase: integer('spend_base'),
		baseCurrency: text('base_currency'),
		fxRate: numeric('fx_rate', { precision: 18, scale: 8, mode: 'number' }),
		fxDated: date('fx_dated', { mode: 'string' }),
		impressions: integer('impressions').notNull(),
		clicks: integer('clicks').notNull()
	},
	(table) => [
		check('ad_metrics_daily_provider_check', sql`${table.provider} IN ('meta', 'google')`),
		check(
			'ad_metrics_daily_currency_chk',
			sql`${table.currency} IS NULL OR ${table.currency} IN ('TRY', 'GBP', 'EUR', 'USD')`
		),
		check(
			'ad_metrics_daily_base_currency_chk',
			sql`${table.baseCurrency} IS NULL OR ${table.baseCurrency} IN ('TRY', 'GBP', 'EUR', 'USD')`
		),
		check(
			'ad_metrics_daily_spend_base_nonneg_chk',
			sql`${table.spendBase} IS NULL OR ${table.spendBase} >= 0`
		),
		// A converted amount is only trustworthy with the currency and rate it came
		// from — no spend_base without its provenance (OPS-02c).
		check(
			'ad_metrics_daily_fx_snapshot_chk',
			sql`${table.spendBase} IS NULL OR (${table.baseCurrency} IS NOT NULL AND ${table.fxRate} IS NOT NULL AND ${table.fxDated} IS NOT NULL)`
		),
		uniqueIndex('ad_metrics_daily_tenant_provider_date_campaign_uidx').on(
			table.tenantId,
			table.provider,
			table.date,
			table.campaignId
		),
		index('ad_metrics_daily_tenant_date_idx').on(table.tenantId, table.date)
	]
);

export type AdMetricsDailyRow = typeof adMetricsDaily.$inferSelect;
export type NewAdMetricsDailyRow = typeof adMetricsDaily.$inferInsert;
