import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GHL_SCOPES,
	GhlOAuthClient,
	parseGhlStoredSecret,
	type FetchFn
} from './ghl-oauth.client';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('GhlOAuthClient', () => {
	const config = {
		clientId: 'client-ghl',
		clientSecret: 'secret-ghl',
		scopes: DEFAULT_GHL_SCOPES,
		userType: 'Location' as const
	};

	it('buildAuthorizeUrl includes client_id, scope, state', () => {
		const client = new GhlOAuthClient(config);
		const url = new URL(
			client.buildAuthorizeUrl({
				state: 'st-1',
				redirectUri: 'http://localhost:3000/v1/integrations/crm/callback'
			})
		);
		expect(url.origin + url.pathname).toBe(
			'https://marketplace.gohighlevel.com/oauth/chooselocation'
		);
		expect(url.searchParams.get('client_id')).toBe('client-ghl');
		expect(url.searchParams.get('response_type')).toBe('code');
		expect(url.searchParams.get('state')).toBe('st-1');
		expect(url.searchParams.get('scope')).toContain('contacts.readonly');
	});

	it('exchangeCode stores access+refresh+location in secret JSON', async () => {
		const fetchFn: FetchFn = async (_input, init) => {
			expect(init?.method).toBe('POST');
			const body = String(init?.body ?? '');
			expect(body).toContain('grant_type=authorization_code');
			expect(body).toContain('code=auth-code');
			expect(body).toContain('user_type=Location');
			return jsonResponse({
				access_token: 'access-1',
				refresh_token: 'refresh-1',
				expires_in: 3600,
				userType: 'Location',
				locationId: 'loc-abc',
				companyId: 'co-xyz',
				scope: DEFAULT_GHL_SCOPES
			});
		};

		const client = new GhlOAuthClient(config, fetchFn);
		const before = Date.now();
		const { secret } = await client.exchangeCode({
			code: 'auth-code',
			redirectUri: 'http://localhost:3000/v1/integrations/crm/callback'
		});
		const parsed = parseGhlStoredSecret(secret);
		expect(parsed.accessToken).toBe('access-1');
		expect(parsed.refreshToken).toBe('refresh-1');
		expect(parsed.locationId).toBe('loc-abc');
		expect(parsed.companyId).toBe('co-xyz');
		expect(parsed.userType).toBe('Location');
		expect(parsed.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50);
	});

	it('refresh rotates tokens and keeps locationId if omitted', async () => {
		const fetchFn: FetchFn = async (_input, init) => {
			const body = String(init?.body ?? '');
			expect(body).toContain('grant_type=refresh_token');
			expect(body).toContain('refresh_token=refresh-old');
			return jsonResponse({
				access_token: 'access-2',
				refresh_token: 'refresh-2',
				expires_in: 86_400,
				userType: 'Location'
			});
		};

		const client = new GhlOAuthClient(config, fetchFn);
		const { secret } = await client.refresh(
			JSON.stringify({
				accessToken: 'access-old',
				refreshToken: 'refresh-old',
				expiresAt: Date.now() - 1,
				userType: 'Location',
				locationId: 'loc-keep',
				companyId: 'co-keep',
				scope: null
			})
		);
		const parsed = parseGhlStoredSecret(secret);
		expect(parsed.accessToken).toBe('access-2');
		expect(parsed.refreshToken).toBe('refresh-2');
		expect(parsed.locationId).toBe('loc-keep');
		expect(parsed.companyId).toBe('co-keep');
	});
});
