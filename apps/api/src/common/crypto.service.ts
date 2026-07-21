import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
export const CREDENTIAL_KEY_VERSION = 1;

@Injectable()
export class CryptoService {
	private key: Buffer | null = null;

	encrypt(plaintext: string): Buffer {
		const key = this.getKey();
		const iv = randomBytes(IV_LENGTH);
		const cipher = createCipheriv(ALGORITHM, key, iv);
		const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
		const authTag = cipher.getAuthTag();
		return Buffer.concat([iv, authTag, encrypted]);
	}

	decrypt(payload: Buffer): string {
		if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH) {
			throw new InternalServerErrorException({
				error: { code: 'decryption_error', message: 'Invalid credential ciphertext' }
			});
		}

		const key = this.getKey();
		const iv = payload.subarray(0, IV_LENGTH);
		const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
		const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
		const decipher = createDecipheriv(ALGORITHM, key, iv);
		decipher.setAuthTag(authTag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	}

	private getKey(): Buffer {
		if (this.key) return this.key;

		const raw = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
		if (!raw) {
			throw new InternalServerErrorException({
				error: {
					code: 'encryption_key_missing',
					message: 'CREDENTIALS_ENCRYPTION_KEY is not configured'
				}
			});
		}

		if (/^[0-9a-fA-F]{64}$/.test(raw)) {
			this.key = Buffer.from(raw, 'hex');
			return this.key;
		}

		const decoded = Buffer.from(raw, 'base64');
		if (decoded.length !== 32) {
			throw new InternalServerErrorException({
				error: {
					code: 'encryption_key_invalid',
					message: 'CREDENTIALS_ENCRYPTION_KEY must be 32-byte hex or base64'
				}
			});
		}

		this.key = decoded;
		return this.key;
	}
}
