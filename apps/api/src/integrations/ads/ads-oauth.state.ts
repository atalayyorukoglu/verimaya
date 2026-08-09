import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdProvider } from '@verimaya/shared';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../common/crypto.service';
import { OAUTH_STATE_TTL_MS } from '../oauth-state.constants';
import { OAuthStateUsedStore } from '../oauth-state-used.store';

export type AdsOAuthStatePayload = {
	tenantId: string;
	provider: AdProvider;
	exp: number;
	jti: string;
};

@Injectable()
export class AdsOAuthStateService {
	constructor(
		private readonly crypto: CryptoService,
		private readonly usedStore: OAuthStateUsedStore
	) {}

	encodeState(input: { tenantId: string; provider: AdProvider }): string {
		const payload: AdsOAuthStatePayload = {
			tenantId: input.tenantId,
			provider: input.provider,
			exp: Date.now() + OAUTH_STATE_TTL_MS,
			jti: randomUUID()
		};
		return this.crypto.encrypt(JSON.stringify(payload)).toString('base64url');
	}

	async decodeState(token: string, expectedProvider: AdProvider): Promise<AdsOAuthStatePayload> {
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
			typeof (parsed as AdsOAuthStatePayload).tenantId !== 'string' ||
			typeof (parsed as AdsOAuthStatePayload).provider !== 'string' ||
			typeof (parsed as AdsOAuthStatePayload).exp !== 'number' ||
			typeof (parsed as AdsOAuthStatePayload).jti !== 'string' ||
			(parsed as AdsOAuthStatePayload).jti.length === 0
		) {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'Malformed OAuth state' }
			});
		}

		const payload = parsed as AdsOAuthStatePayload;
		if (payload.provider !== expectedProvider) {
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
