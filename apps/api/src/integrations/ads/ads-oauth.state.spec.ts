import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '../../common/crypto.service';
import type { OAuthStateUsedStore } from '../oauth-state-used.store';
import { AdsOAuthStateService } from './ads-oauth.state';

function memoryUsedStore(): OAuthStateUsedStore {
	const used = new Set<string>();
	return {
		claimOnce: vi.fn(async (jti: string) => {
			if (used.has(jti)) {
				throw new BadRequestException({
					error: { code: 'oauth_state_replayed', message: 'OAuth state already used' }
				});
			}
			used.add(jti);
		})
	} as unknown as OAuthStateUsedStore;
}

function errorCode(err: unknown): string | undefined {
	if (!(err instanceof BadRequestException)) return undefined;
	const body = err.getResponse() as { error?: { code?: string } };
	return body.error?.code;
}

describe('AdsOAuthStateService', () => {
	beforeEach(() => {
		process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');
	});

	it('decodes a valid state once', async () => {
		const svc = new AdsOAuthStateService(new CryptoService(), memoryUsedStore());
		const token = svc.encodeState({ tenantId: 'tenant-aaa', provider: 'meta' });
		const payload = await svc.decodeState(token, 'meta');
		expect(payload.tenantId).toBe('tenant-aaa');
		expect(payload.provider).toBe('meta');
		expect(payload.jti.length).toBeGreaterThan(0);
	});

	it('rejects the same state on second decode (replay)', async () => {
		const svc = new AdsOAuthStateService(new CryptoService(), memoryUsedStore());
		const token = svc.encodeState({ tenantId: 'tenant-aaa', provider: 'meta' });
		await svc.decodeState(token, 'meta');
		await expect(svc.decodeState(token, 'meta')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'oauth_state_replayed'
		);
	});

	it('rejects expired state', async () => {
		const crypto = new CryptoService();
		const svc = new AdsOAuthStateService(crypto, memoryUsedStore());
		const token = svc.encodeState({ tenantId: 'tenant-aaa', provider: 'meta' });
		const plaintext = crypto.decrypt(Buffer.from(token, 'base64url'));
		const parsed = JSON.parse(plaintext) as {
			tenantId: string;
			provider: string;
			exp: number;
			jti: string;
		};
		parsed.exp = Date.now() - 1;
		const expired = crypto.encrypt(JSON.stringify(parsed)).toString('base64url');
		await expect(svc.decodeState(expired, 'meta')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'oauth_state_expired'
		);
	});

	it('rejects provider mismatch', async () => {
		const svc = new AdsOAuthStateService(new CryptoService(), memoryUsedStore());
		const token = svc.encodeState({ tenantId: 'tenant-aaa', provider: 'meta' });
		await expect(svc.decodeState(token, 'google')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'invalid_oauth_state'
		);
	});

	it('rejects tampered / undecryptable state', async () => {
		const svc = new AdsOAuthStateService(new CryptoService(), memoryUsedStore());
		const token = svc.encodeState({ tenantId: 'tenant-aaa', provider: 'meta' });
		const mangled = `${token.slice(0, -4)}xxxx`;
		await expect(svc.decodeState(mangled, 'meta')).rejects.toSatisfy(
			(err: unknown) => errorCode(err) === 'invalid_oauth_state'
		);
	});
});
