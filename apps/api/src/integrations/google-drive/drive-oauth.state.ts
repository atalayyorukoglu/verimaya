import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CryptoService } from '../../common/crypto.service';
import { OAUTH_STATE_TTL_MS } from '../oauth-state.constants';
import { OAuthStateUsedStore } from '../oauth-state-used.store';

export type DriveOAuthStatePayload = {
	tenantId: string;
	exp: number;
	jti: string;
};

/**
 * DRIVE-01 — callback kamuya açık olduğu için tenant istekten değil, imzalı
 * state'ten çözülür (Ads/GHL ile aynı kalıp). `jti` bir kez harcanır.
 */
@Injectable()
export class DriveOAuthStateService {
	constructor(
		private readonly crypto: CryptoService,
		private readonly usedStore: OAuthStateUsedStore
	) {}

	encodeState(input: { tenantId: string }): string {
		const payload: DriveOAuthStatePayload = {
			tenantId: input.tenantId,
			exp: Date.now() + OAUTH_STATE_TTL_MS,
			jti: randomUUID()
		};
		return this.crypto.encrypt(JSON.stringify(payload)).toString('base64url');
	}

	async decodeState(token: string): Promise<DriveOAuthStatePayload> {
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
			typeof (parsed as DriveOAuthStatePayload).tenantId !== 'string' ||
			typeof (parsed as DriveOAuthStatePayload).exp !== 'number' ||
			typeof (parsed as DriveOAuthStatePayload).jti !== 'string' ||
			(parsed as DriveOAuthStatePayload).jti.length === 0
		) {
			throw new BadRequestException({
				error: { code: 'invalid_oauth_state', message: 'Malformed OAuth state' }
			});
		}

		const payload = parsed as DriveOAuthStatePayload;
		if (Date.now() > payload.exp) {
			throw new BadRequestException({
				error: { code: 'oauth_state_expired', message: 'OAuth state expired' }
			});
		}

		// Jeton takası başarısız olsa bile state yanmalı — önce harca, sonra dön.
		const remainingMs = Math.max(1, payload.exp - Date.now());
		await this.usedStore.claimOnce(payload.jti, remainingMs);

		return payload;
	}
}
