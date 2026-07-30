import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** Header carrying Unix-seconds timestamp for replay protection. */
export const WAHA_TIMESTAMP_HEADER = 'x-webhook-timestamp';

/** Header carrying `v1=<hex>` HMAC-SHA256 of `${timestamp}.${rawBody}`. */
export const WAHA_SIGNATURE_HEADER = 'x-webhook-signature';

/** ±5 minutes (plan Adım 22). */
export const WAHA_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export type WebhookRequestWithRawBody = FastifyRequest & { rawBody?: string };

/**
 * Prefer captured `rawBody` (preParsing hook); fall back to string body or
 * JSON.stringify for unit tests that inject a parsed object + rawBody.
 */
export function extractRawBody(request: WebhookRequestWithRawBody): string {
	if (typeof request.rawBody === 'string') {
		return request.rawBody;
	}
	if (typeof request.body === 'string') {
		return request.body;
	}
	return JSON.stringify(request.body ?? {});
}

/** Build HMAC hex for WAHA webhook verification / test helpers. */
export function signWahaPayload(
	rawBody: string,
	secret: string,
	timestampSeconds: number
): string {
	const signed = `${timestampSeconds}.${rawBody}`;
	return createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
}

export function formatWahaSignatureHeader(hexDigest: string): string {
	return `v1=${hexDigest}`;
}

/**
 * Parse `v1=<hex>` (optional surrounding whitespace). Returns null if malformed.
 */
export function parseWahaSignatureHeader(header: string): string | null {
	const trimmed = header.trim();
	const match = /^v1=([0-9a-fA-F]+)$/.exec(trimmed);
	return match?.[1]?.toLowerCase() ?? null;
}

function safeEqualHex(a: string, b: string): boolean {
	try {
		const bufA = Buffer.from(a, 'hex');
		const bufB = Buffer.from(b, 'hex');
		if (bufA.length === 0 || bufA.length !== bufB.length) return false;
		return timingSafeEqual(bufA, bufB);
	} catch {
		return false;
	}
}

export type VerifyWahaSignatureInput = {
	rawBody: string;
	signatureHeader: string | undefined;
	timestampHeader: string | undefined;
	secret: string;
	/** Injected for tests; defaults to Date.now()/1000. */
	nowSeconds?: number;
	toleranceSeconds?: number;
};

/**
 * Verifies HMAC-SHA256 + timestamp window. Throws UnauthorizedException on failure.
 */
export function verifyWahaSignature(input: VerifyWahaSignatureInput): void {
	const {
		rawBody,
		signatureHeader,
		timestampHeader,
		secret,
		nowSeconds = Math.floor(Date.now() / 1000),
		toleranceSeconds = WAHA_TIMESTAMP_TOLERANCE_SECONDS
	} = input;

	if (!secret.trim()) {
		throw new UnauthorizedException('WAHA webhook secret is not configured');
	}

	if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
		throw new UnauthorizedException('Missing webhook signature');
	}
	if (typeof timestampHeader !== 'string' || !timestampHeader.trim()) {
		throw new UnauthorizedException('Missing webhook timestamp');
	}

	const timestamp = Number(timestampHeader.trim());
	if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) {
		throw new UnauthorizedException('Invalid webhook timestamp');
	}

	if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
		throw new UnauthorizedException('Webhook timestamp outside allowed window');
	}

	const provided = parseWahaSignatureHeader(signatureHeader);
	if (!provided) {
		throw new UnauthorizedException('Invalid webhook signature format');
	}

	const expected = signWahaPayload(rawBody, secret, timestamp);
	if (!safeEqualHex(provided, expected)) {
		throw new UnauthorizedException('Invalid webhook signature');
	}
}
