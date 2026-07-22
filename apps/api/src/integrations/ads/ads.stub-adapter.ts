import type { AdProvider } from '@verimaya/shared';
import type { AdsProviderAdapter, NormalizedAdMetricRow } from './ads.types';

/** Deterministic stub campaign ids (distinct from ad-metrics fixtures). */
export const STUB_META_CAMPAIGN_ID = 'stub-meta-campaign-1';
export const STUB_GOOGLE_CAMPAIGN_ID = 'stub-google-campaign-1';

function utcDateString(daysAgo: number): string {
	const d = new Date();
	d.setUTCHours(0, 0, 0, 0);
	d.setUTCDate(d.getUTCDate() - daysAgo);
	return d.toISOString().slice(0, 10);
}

/**
 * Placeholder Ads adapter until Meta/Google HTTP clients land (RM-4b/c).
 * Deterministic authorize URL, token, and daily rows for local/dev + isolation tests.
 */
export class StubAdsAdapter implements AdsProviderAdapter {
	constructor(readonly provider: AdProvider) {}

	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string {
		const url = new URL(`https://stub.ads.local/${this.provider}/oauth/authorize`);
		url.searchParams.set('state', p.state);
		url.searchParams.set('redirect_uri', p.redirectUri);
		return url.toString();
	}

	async exchangeCode(_p: { code: string; redirectUri: string }): Promise<{ secret: string }> {
		return { secret: `stub-${this.provider}-token` };
	}

	async pullDailyMetrics(_p: { secret: string; since: string }): Promise<NormalizedAdMetricRow[]> {
		const yesterday = utcDateString(1);
		const twoDaysAgo = utcDateString(2);
		const campaignId =
			this.provider === 'meta' ? STUB_META_CAMPAIGN_ID : STUB_GOOGLE_CAMPAIGN_ID;

		return [
			{
				provider: this.provider,
				date: yesterday,
				campaignId,
				spendMinor: this.provider === 'meta' ? 22_000 : 18_500,
				impressions: this.provider === 'meta' ? 9_100 : 7_400,
				clicks: this.provider === 'meta' ? 410 : 360
			},
			{
				provider: this.provider,
				date: twoDaysAgo,
				campaignId,
				spendMinor: this.provider === 'meta' ? 19_400 : 16_200,
				impressions: this.provider === 'meta' ? 8_200 : 6_800,
				clicks: this.provider === 'meta' ? 355 : 290
			}
		];
	}
}
