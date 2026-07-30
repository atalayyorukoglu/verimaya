import { describe, expect, it } from 'vitest';
import { GoogleAdsAdapter, type FetchFn } from './google-ads.adapter';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('GoogleAdsAdapter', () => {
	const config = {
		clientId: 'client-123',
		clientSecret: 'secret-456',
		developerToken: 'dev-tok',
		apiVersion: 'v17'
	};

	it('buildAuthorizeUrl includes adwords scope and access_type=offline', () => {
		const adapter = new GoogleAdsAdapter(config);
		const url = new URL(
			adapter.buildAuthorizeUrl({
				state: 'state-xyz',
				redirectUri: 'http://localhost:3000/v1/integrations/ads/google/callback'
			})
		);

		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
		expect(url.searchParams.get('client_id')).toBe('client-123');
		expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/adwords');
		expect(url.searchParams.get('access_type')).toBe('offline');
		expect(url.searchParams.get('prompt')).toBe('consent');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('state')).toBe('state-xyz');
	});

	it('exchangeCode stores refreshToken and customerId in secret JSON', async () => {
		const fetchFn: FetchFn = async (input, init) => {
			const url = String(input);
			if (url === 'https://oauth2.googleapis.com/token') {
				expect(init?.method).toBe('POST');
				const body = String(init?.body ?? '');
				expect(body).toContain('grant_type=authorization_code');
				expect(body).toContain('client_id=client-123');
				return jsonResponse({
					access_token: 'access-abc',
					refresh_token: 'refresh-xyz'
				});
			}
			if (url.includes('/customers:listAccessibleCustomers')) {
				expect(init?.headers).toMatchObject({
					authorization: 'Bearer access-abc',
					'developer-token': 'dev-tok'
				});
				return jsonResponse({ resourceNames: ['customers/9876543210'] });
			}
			throw new Error(`unexpected URL: ${url}`);
		};

		const adapter = new GoogleAdsAdapter(config, fetchFn);
		const { secret } = await adapter.exchangeCode({
			code: 'auth-code',
			redirectUri: 'http://localhost:3000/v1/integrations/ads/google/callback'
		});

		const parsed = JSON.parse(secret) as { refreshToken: string; customerId: string };
		expect(parsed.refreshToken).toBe('refresh-xyz');
		expect(parsed.customerId).toBe('9876543210');
	});

	it('pullDailyMetrics maps cost_micros to kuruş integer', async () => {
		const fetchFn: FetchFn = async (input, init) => {
			const url = String(input);
			if (url === 'https://oauth2.googleapis.com/token') {
				expect(String(init?.body ?? '')).toContain('grant_type=refresh_token');
				return jsonResponse({ access_token: 'access-fresh' });
			}
			if (url.includes('/googleAds:searchStream')) {
				expect(url).toContain('/customers/9876543210/');
				expect(init?.headers).toMatchObject({
					authorization: 'Bearer access-fresh',
					'developer-token': 'dev-tok'
				});
				const body = JSON.parse(String(init?.body ?? '{}')) as { query: string };
				expect(body.query).toContain('metrics.cost_micros');
				expect(body.query).toContain("BETWEEN '2026-07-01'");
				return jsonResponse([
					{
						results: [
							{
								segments: { date: '2026-07-20' },
								campaign: { id: '123' },
								metrics: {
									costMicros: '12500000',
									impressions: '8400',
									clicks: '320'
								}
							}
						]
					}
				]);
			}
			throw new Error(`unexpected URL: ${url}`);
		};

		const adapter = new GoogleAdsAdapter(config, fetchFn);
		const rows = await adapter.pullDailyMetrics({
			secret: JSON.stringify({
				refreshToken: 'refresh-xyz',
				customerId: '9876543210'
			}),
			since: '2026-07-01'
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({
			provider: 'google',
			date: '2026-07-20',
			campaignId: '123',
			spendMinor: 1250,
			impressions: 8400,
			clicks: 320
		});
	});

	it('sends login-customer-id when MCC id is configured', async () => {
		const fetchFn: FetchFn = async (input, init) => {
			const url = String(input);
			if (url === 'https://oauth2.googleapis.com/token') {
				return jsonResponse({ access_token: 'access-fresh' });
			}
			if (url.includes('/googleAds:searchStream')) {
				expect(init?.headers).toMatchObject({
					authorization: 'Bearer access-fresh',
					'developer-token': 'dev-tok',
					'login-customer-id': '1112223333'
				});
				return jsonResponse([]);
			}
			throw new Error(`unexpected URL: ${url}`);
		};

		const adapter = new GoogleAdsAdapter(
			{ ...config, loginCustomerId: '111-222-3333' },
			fetchFn
		);
		await adapter.pullDailyMetrics({
			secret: JSON.stringify({
				refreshToken: 'refresh-xyz',
				customerId: '9876543210'
			}),
			since: '2026-07-01'
		});
	});
});
