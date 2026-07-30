import { describe, expect, it, vi } from 'vitest';
import type { SettingsService } from '../../settings/settings.service';
import type { GhlOAuthClient } from './ghl-oauth.client';
import { GhlHttpClient } from './ghl.client.http';
import type { GhlSyncService } from './ghl.sync.service';
import type { FetchFn } from './ghl-oauth.client';

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}

describe('GhlHttpClient', () => {
	const tenantId = 'tenant-1';
	const secretJson = JSON.stringify({
		accessToken: 'access-1',
		refreshToken: 'refresh-1',
		expiresAt: Date.now() + 3_600_000,
		userType: 'Location',
		locationId: 'loc-1',
		companyId: 'co-1',
		scope: null
	});

	const settings = {
		loadCredentialSecret: vi.fn(async () => secretJson),
		storeCredential: vi.fn(async () => ({ configured: true as const, key_version: 1 }))
	} as unknown as SettingsService;

	const sync = {
		processInboundEvent: vi.fn()
	} as unknown as GhlSyncService;

	const oauth = {
		refresh: vi.fn()
	} as unknown as GhlOAuthClient;

	it('getContact maps API contact row', async () => {
		const fetchFn: FetchFn = async (input) => {
			expect(String(input)).toContain('/contacts/c1');
			return jsonResponse({
				contact: {
					id: 'c1',
					locationId: 'loc-1',
					fullName: 'Ada Lovelace',
					phone: '+1',
					email: 'ada@example.com'
				}
			});
		};

		const client = new GhlHttpClient(sync, settings, {
			fetchFn,
			oauth,
			minRequestGapMs: 0,
			sleepFn: async () => undefined
		});
		const contact = await client.getContact(tenantId, 'c1');
		expect(contact).toEqual({
			id: 'c1',
			locationId: 'loc-1',
			fullName: 'Ada Lovelace',
			phone: '+1',
			email: 'ada@example.com',
			dateUpdated: null
		});
	});

	it('retries on 429 with backoff then succeeds', async () => {
		const sleeps: number[] = [];
		let calls = 0;
		const fetchFn: FetchFn = async () => {
			calls += 1;
			if (calls === 1) {
				return jsonResponse({ message: 'rate' }, 429, { 'retry-after': '1' });
			}
			return jsonResponse({
				contact: { id: 'c2', fullName: 'Ok' }
			});
		};

		const client = new GhlHttpClient(sync, settings, {
			fetchFn,
			oauth,
			minRequestGapMs: 0,
			sleepFn: async (ms) => {
				sleeps.push(ms);
			}
		});
		const contact = await client.getContact(tenantId, 'c2');
		expect(contact?.id).toBe('c2');
		expect(calls).toBe(2);
		expect(sleeps[0]).toBe(1000);
	});

	it('listContacts requires locationId on credential', async () => {
		const settingsNoLoc = {
			loadCredentialSecret: vi.fn(async () =>
				JSON.stringify({
					accessToken: 'a',
					refreshToken: 'r',
					expiresAt: Date.now() + 99_000,
					userType: 'Company',
					locationId: null,
					companyId: 'co',
					scope: null
				})
			),
			storeCredential: vi.fn()
		} as unknown as SettingsService;

		const client = new GhlHttpClient(sync, settingsNoLoc, {
			fetchFn: async () => jsonResponse({}),
			oauth,
			minRequestGapMs: 0,
			sleepFn: async () => undefined
		});
		await expect(client.listContacts(tenantId)).rejects.toThrow(/locationId/);
	});
});
