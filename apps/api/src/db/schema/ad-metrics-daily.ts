import { check, date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
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
		impressions: integer('impressions').notNull(),
		clicks: integer('clicks').notNull()
	},
	(table) => [
		check('ad_metrics_daily_provider_check', sql`${table.provider} IN ('meta', 'google')`),
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
