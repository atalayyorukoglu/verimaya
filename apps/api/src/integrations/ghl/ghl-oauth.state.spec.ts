import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import { CryptoService } from '../../common/crypto.service';
import { GhlOAuthStateService } from './ghl-oauth.state';

describe('GhlOAuthStateService', () => {
	beforeEach(() => {
		process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('hex');
	});

	it('round-trips tenant id', () => {
		const svc = new GhlOAuthStateService(new CryptoService());
		const token = svc.encodeState({ tenantId: 'tenant-aaa' });
		const payload = svc.decodeState(token);
		expect(payload.tenantId).toBe('tenant-aaa');
		expect(payload.provider).toBe('ghl');
	});

	it('rejects tampered state', () => {
		const svc = new GhlOAuthStateService(new CryptoService());
		const token = svc.encodeState({ tenantId: 'tenant-aaa' });
		const mangled = `${token.slice(0, -4)}xxxx`;
		expect(() => svc.decodeState(mangled)).toThrow(BadRequestException);
	});

	it('rejects expired state', () => {
		const svc = new GhlOAuthStateService(new CryptoService());
		const token = svc.encodeState({ tenantId: 'tenant-aaa' });
		const plaintext = new CryptoService().decrypt(Buffer.from(token, 'base64url'));
		const parsed = JSON.parse(plaintext) as { tenantId: string; provider: string; exp: number };
		parsed.exp = Date.now() - 1;
		const expired = new CryptoService()
			.encrypt(JSON.stringify(parsed))
			.toString('base64url');
		expect(() => svc.decodeState(expired)).toThrow(BadRequestException);
	});
});
