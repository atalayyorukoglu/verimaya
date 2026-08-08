import type { NewAdMetricsDailyRow } from '../db/schema/ad-metrics-daily';

/** Deterministic fixture campaign ids (stable across runs for idempotent upsert). */
export const FIXTURE_META_CAMPAIGN_ID = 'fixture-meta-campaign-1';
export const FIXTURE_GOOGLE_CAMPAIGN_ID = 'fixture-google-campaign-1';

function utcDateString(daysAgo: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - daysAgo);
	return d.toISOString().slice(0, 10);
}

/**
 * 1–3 deterministic sample rows for a tenant when no Meta/Google OAuth credentials exist.
 * Currency = tenant base (fixture data is synthetic in-tenant; not an Ads API guess).
 * Unique key: (tenant_id, provider, date, campaign_id).
 */
export function buildFixtureAdMetricsRows(
	tenantId: string,
	tenantBaseCurrency = 'TRY'
): NewAdMetricsDailyRow[] {
	const yesterday = utcDateString(1);
	const twoDaysAgo = utcDateString(2);

	return [
		{
			tenantId,
			provider: 'meta',
			date: yesterday,
			campaignId: FIXTURE_META_CAMPAIGN_ID,
			spendMinor: 12_500,
			currency: tenantBaseCurrency,
			impressions: 8_400,
			clicks: 320
		},
		{
			tenantId,
			provider: 'meta',
			date: twoDaysAgo,
			campaignId: FIXTURE_META_CAMPAIGN_ID,
			spendMinor: 9_800,
			currency: tenantBaseCurrency,
			impressions: 6_100,
			clicks: 245
		},
		{
			tenantId,
			provider: 'google',
			date: yesterday,
			campaignId: FIXTURE_GOOGLE_CAMPAIGN_ID,
			spendMinor: 15_200,
			currency: tenantBaseCurrency,
			impressions: 11_200,
			clicks: 410
		}
	];
}
