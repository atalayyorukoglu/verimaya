import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdProvider } from '@verimaya/shared';
import { CryptoService } from '../../common/crypto.service';

const STATE_TTL_MS = 10 * 60 * 1000;

export type AdsOAuthStatePayload = {
	tenantId: string;
	provider: AdProvider;
	exp: number;
};

@Injectable()
export class AdsOAuthStateService {
	constructor(private readonly crypto: CryptoService) {}

	encodeState(input: { tenantId: string; provider: AdProvider }): string {
		const payload: AdsOAuthStatePayload = {
			tenantId: input.tenantId,
			provider: input.provider,
			exp: Date.now() + STATE_TTL_MS
		};
		return this.crypto.encrypt(JSON.stringify(payload)).toString('base64url');
	}

	decodeState(token: string, expectedProvider: AdProvider): AdsOAuthStatePayload {
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
			typeof (parsed as AdsOAuthStatePayload).exp !== 'number'
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

		return payload;
	}
}
