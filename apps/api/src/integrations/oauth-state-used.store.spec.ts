import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { OAuthStateUsedStore } from './oauth-state-used.store';

/**
 * AUDIT-F09-14: the ledger itself is the replay control — the state services only call it.
 * Redis is faked at the client boundary (SET NX PX semantics) so the spec runs without a server.
 */

type SetArgs = [string, string, 'PX', number, 'NX'];

function storeWith(set: (...args: SetArgs) => Promise<string | null>): OAuthStateUsedStore {
	const store = new OAuthStateUsedStore({} as ConfigService);
	// onModuleInit builds the real client from REDIS_URL; inject the fake instead.
	(store as unknown as { redis: { set: typeof set } }).redis = { set };
	return store;
}

function errorCode(err: unknown): string | undefined {
	if (!(err instanceof BadRequestException) && !(err instanceof ServiceUnavailableException)) {
		return undefined;
	}
	const body = err.getResponse() as { error?: { code?: string } };
	return body.error?.code;
}

describe('OAuthStateUsedStore', () => {
	it('first claim wins and second claim is rejected as replay', async () => {
		const seen = new Set<string>();
		const set = vi.fn(async (key: string) => {
			if (seen.has(key)) return null; // NX: key exists → SET is a no-op
			seen.add(key);
			return 'OK';
		});
		const store = storeWith(set as unknown as (...args: SetArgs) => Promise<string | null>);

		await expect(store.claimOnce('jti-1', 60_000)).resolves.toBeUndefined();
		await expect(store.claimOnce('jti-1', 60_000)).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'oauth_state_replayed'
		);
		expect(set).toHaveBeenCalledWith('oauth:state:used:jti-1', '1', 'PX', 60_000, 'NX');
	});

	it('a different jti is independent', async () => {
		const seen = new Set<string>();
		const set = async (key: string) => {
			if (seen.has(key)) return null;
			seen.add(key);
			return 'OK';
		};
		const store = storeWith(set as unknown as (...args: SetArgs) => Promise<string | null>);

		await expect(store.claimOnce('jti-a', 60_000)).resolves.toBeUndefined();
		await expect(store.claimOnce('jti-b', 60_000)).resolves.toBeUndefined();
	});

	it('fails closed when Redis errors (never silently allows the callback)', async () => {
		const store = storeWith(async () => {
			throw new Error('ECONNREFUSED');
		});

		await expect(store.claimOnce('jti-1', 60_000)).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'oauth_state_store_unavailable'
		);
	});

	it('fails closed before onModuleInit has built the client', async () => {
		const store = new OAuthStateUsedStore({} as ConfigService);

		await expect(store.claimOnce('jti-1', 60_000)).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'oauth_state_store_unavailable'
		);
	});

	it('floors sub-millisecond TTLs to 1ms so PX is never zero or negative', async () => {
		const set = vi.fn(async () => 'OK');
		const store = storeWith(set as unknown as (...args: SetArgs) => Promise<string | null>);

		await store.claimOnce('jti-1', 0.4);
		expect(set).toHaveBeenCalledWith('oauth:state:used:jti-1', '1', 'PX', 1, 'NX');
	});
});
