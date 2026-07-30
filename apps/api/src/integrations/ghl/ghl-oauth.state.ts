import { BadRequestException, Injectable } from '@nestjs/common';
import { CryptoService } from '../../common/crypto.service';

const STATE_TTL_MS = 10 * 60 * 1000;
export const GHL_OAUTH_PROVIDER = 'ghl' as const;

export type GhlOAuthStatePayload = {
	tenantId: string;
	provider: typeof GHL_OAUTH_PROVIDER;
	exp: number;
};

/**
 * Signed OAuth state for GHL (mirrors AdsOAuthStateService; not generalized — plan Adım 40).
 */
@Injectable()
export class GhlOAuthStateService {
	constructor(private readonly crypto: CryptoService) {}

	encodeState(input: { tenantId: string }): string {
		const payload: GhlOAuthStatePayload = {
			tenantId: input.tenantId,
			provider: GHL_OAUTH_PROVIDER,
			exp: Date.now() + STATE_TTL_MS
		};
		return this.crypto.encrypt(JSON.stringify(payload)).toString('base64url');
	}

	decodeState(token: string): GhlOAuthStatePayload {
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
			typeof (parsed as GhlOAuthStatePayload).exp !== 'number'
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

		return payload;
	}
}
