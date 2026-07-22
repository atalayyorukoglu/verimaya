import { describe, expect, it } from 'vitest';
import { MetaAdsAdapter, type FetchFn } from './meta-ads.adapter';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('MetaAdsAdapter', () => {
	const config = {
		appId: 'app-123',
		appSecret: 'secret-456',
		apiVersion: 'v21.0'
	};

	it('buildAuthorizeUrl includes client_id, ads_read scope, and state', () => {
		const adapter = new MetaAdsAdapter(config);
		const url = new URL(
			adapter.buildAuthorizeUrl({
				state: 'state-xyz',
				redirectUri: 'http://localhost:3000/v1/integrations/ads/meta/callback'
			})
		);

		expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
		expect(url.searchParams.get('client_id')).toBe('app-123');
		expect(url.searchParams.get('scope')).toBe('ads_read');
		expect(url.searchParams.get('state')).toBe('state-xyz');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('redirect_uri')).toContain('/meta/callback');
	});

	it('exchangeCode stores accessToken and adAccountId in secret JSON', async () => {
		const calls: string[] = [];
		const fetchFn: FetchFn = async (input) => {
			const url = String(input);
			calls.push(url);
			if (url.includes('/oauth/access_token')) {
				return jsonResponse({ access_token: 'tok-abc' });
			}
			if (url.includes('/me/adaccounts')) {
				return jsonResponse({ data: [{ account_id: '999888777' }] });
			}
			throw new Error(`unexpected URL: ${url}`);
		};

		const adapter = new MetaAdsAdapter(config, fetchFn);
		const { secret } = await adapter.exchangeCode({
			code: 'auth-code',
			redirectUri: 'http://localhost:3000/v1/integrations/ads/meta/callback'
		});

		const parsed = JSON.parse(secret) as { accessToken: string; adAccountId: string };
		expect(parsed.accessToken).toBe('tok-abc');
		expect(parsed.adAccountId).toBe('999888777');
		expect(calls[0]).toContain('client_id=app-123');
		expect(calls[0]).toContain('client_secret=secret-456');
		expect(calls[1]).toContain('access_token=tok-abc');
	});

	it('pullDailyMetrics maps spend major-unit string to kuruş integer', async () => {
		const fetchFn: FetchFn = async (input) => {
			const url = String(input);
			expect(url).toContain('/act_999888777/insights');
			expect(url).toContain('level=campaign');
			return jsonResponse({
				data: [
					{
						spend: '12.50',
						impressions: '8400',
						clicks: '320',
						campaign_id: 'c1',
						date_start: '2026-07-20'
					}
				]
			});
		};

		const adapter = new MetaAdsAdapter(config, fetchFn);
		const rows = await adapter.pullDailyMetrics({
			secret: JSON.stringify({ accessToken: 'tok-abc', adAccountId: '999888777' }),
			since: '2026-07-01'
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			provider: 'meta',
			date: '2026-07-20',
			campaignId: 'c1',
			spendMinor: 1250,
			impressions: 8400,
			clicks: 320
		});
	});
});
