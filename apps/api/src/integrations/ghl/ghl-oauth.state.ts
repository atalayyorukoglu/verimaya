import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../common/crypto.service';
import { OAUTH_STATE_TTL_MS } from '../oauth-state.constants';
import { OAuthStateUsedStore } from '../oauth-state-used.store';

export const GHL_OAUTH_PROVIDER = 'ghl' as const;

export type GhlOAuthStatePayload = {
	tenantId: string;
	provider: typeof GHL_OAUTH_PROVIDER;
	exp: number;
	jti: string;
};

/**
 * Signed OAuth state for GHL (mirrors AdsOAuthStateService; not generalized — plan Adım 40).
 */
@Injectable()
export class GhlOAuthStateService {
	constructor(
		private readonly crypto: CryptoService,
		private readonly usedStore: OAuthStateUsedStore
	) {}

	encodeState(input: { tenantId: string }): string {
		const payload: GhlOAuthStatePayload = {
			tenantId: input.tenantId,
			provider: GHL_OAUTH_PROVIDER,
			exp: Date.now() + OAUTH_STATE_TTL_MS,
			jti: randomUUID()
		};
		return this.crypto.encrypt(JSON.stringify(payload)).toString('base64url');
	}

	async decodeState(token: string): Promise<GhlOAuthStatePayload> {
		let plaintext: string;
		try {
			plaintext = this.crypto.decrypt(Buffer.from(token, 'base64url'));
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'Invalid OAuth state' }
			});
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(plaintext);
		} catch {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'Malformed OAuth state' }
			});
		}

		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			typeof (parsed as GhlOAuthStatePayload).tenantId !== 'string' ||
			typeof (parsed as GhlOAuthStatePayload).provider !== 'string' ||
			typeof (parsed as GhlOAuthStatePayload).exp !== 'number' ||
			typeof (parsed as GhlOAuthStatePayload).jti !== 'string' ||
			(parsed as GhlOAuthStatePayload).jti.length === 0
		) {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'Malformed OAuth state' }
			});
		}

		const payload = parsed as GhlOAuthStatePayload;
		if (payload.provider !== GHL_OAUTH_PROVIDER) {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'OAuth state provider mismatch' }
			});
		}
		if (Date.now() > payload.exp) {
			throw new BadRequestException({
				error: { code: 'oauth_state_expired', message: 'OAuth state expired' }
			});
		}

		// Claim before return (and before exchangeCode) so failed token swaps still burn the state.
		const remainingMs = Math.max(1, payload.exp - Date.now());
		await this.usedStore.claimOnce(payload.jti, remainingMs);

		return payload;
	}
}
