import type { AdProvider } from '@verimaya/shared';

/** Provider-normalized daily metric row (tenant attached at sync time). */
export type NormalizedAdMetricRow = {
	provider: AdProvider;
	date: string;
	campaignId: string;
	spendMinor: number;
	impressions: number;
	clicks: number;
};

export type AdsProviderAdapter = {
	readonly provider: AdProvider;
	buildAuthorizeUrl(p: { state: string; redirectUri: string }): string;
	exchangeCode(p: { code: string; redirectUri: string }): Promise<{ secret: string }>;
	pullDailyMetrics(p: { secret: string; since: string }): Promise<NormalizedAdMetricRow[]>;
};
