import { createHash, randomBytes } from 'node:crypto';

export const API_KEY_PREFIX = 'vk_';

export function generateApiKey(): { plaintext: string; prefix: string; hash: string } {
	const secret = randomBytes(24).toString('base64url');
	const plaintext = `${API_KEY_PREFIX}${secret}`;
	const prefix = plaintext.slice(0, 12);
	return {
		plaintext,
		prefix,
		hash: hashApiKey(plaintext)
	};
}

export function hashApiKey(plaintext: string): string {
	return createHash('sha256').update(plaintext).digest('hex');
}

export function isApiKeyToken(value: string): boolean {
	return value.startsWith(API_KEY_PREFIX);
}

export function extractBearerToken(header: string | string[] | undefined): string | undefined {
	const raw = Array.isArray(header) ? header[0] : header;
	if (!raw?.startsWith('Bearer ')) {
		return undefined;
	}
	const token = raw.slice('Bearer '.length).trim();
	return token || undefined;
}
