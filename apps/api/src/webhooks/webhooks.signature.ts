import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

/** Header carrying Unix-seconds timestamp for replay protection. */
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';

/** Header carrying `v1=<hex>` HMAC-SHA256 of `${timestamp}.${rawBody}`. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/** @deprecated Prefer WEBHOOK_TIMESTAMP_HEADER — kept for WAHA call sites. */
export const WAHA_TIMESTAMP_HEADER = WEBHOOK_TIMESTAMP_HEADER;

/** @deprecated Prefer WEBHOOK_SIGNATURE_HEADER — kept for WAHA call sites. */
export const WAHA_SIGNATURE_HEADER = WEBHOOK_SIGNATURE_HEADER;

/** ±5 minutes (plan Adım 22 / 23b). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/** @deprecated Prefer WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS. */
export const WAHA_TIMESTAMP_TOLERANCE_SECONDS = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS;

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

/** Build HMAC hex for webhook verification / test helpers. */
export function signWebhookPayload(
	rawBody: string,
	secret: string,
	timestampSeconds: number
): string {
	const signed = `${timestampSeconds}.${rawBody}`;
	return createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
}

/** @deprecated Prefer signWebhookPayload. */
export const signWahaPayload = signWebhookPayload;

export function formatWebhookSignatureHeader(hexDigest: string): string {
	return `v1=${hexDigest}`;
}

/** @deprecated Prefer formatWebhookSignatureHeader. */
export const formatWahaSignatureHeader = formatWebhookSignatureHeader;

/**
 * Parse `v1=<hex>` (optional surrounding whitespace). Returns null if malformed.
 */
export function parseWebhookSignatureHeader(header: string): string | null {
	const trimmed = header.trim();
	const match = /^v1=([0-9a-fA-F]+)$/.exec(trimmed);
	return match?.[1]?.toLowerCase() ?? null;
}

/** @deprecated Prefer parseWebhookSignatureHeader. */
export const parseWahaSignatureHeader = parseWebhookSignatureHeader;

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

/**
 * Env key for a provider webhook secret: `WEBHOOK_SECRET_GHL`, `WEBHOOK_SECRET_META`, …
 * Non-alphanumeric → `_`; empty after normalize → empty string.
 */
export function providerWebhookSecretEnvKey(provider: string): string {
	const normalized = provider
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
	if (!normalized) return '';
	return `WEBHOOK_SECRET_${normalized}`;
}

export type VerifyWebhookSignatureInput = {
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
export function verifyWebhookSignature(input: VerifyWebhookSignatureInput): void {
	const {
		rawBody,
		signatureHeader,
		timestampHeader,
		secret,
		nowSeconds = Math.floor(Date.now() / 1000),
		toleranceSeconds = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS
	} = input;

	if (!secret.trim()) {
		throw new UnauthorizedException('Webhook secret is not configured');
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

	const provided = parseWebhookSignatureHeader(signatureHeader);
	if (!provided) {
		throw new UnauthorizedException('Invalid webhook signature format');
	}

	const expected = signWebhookPayload(rawBody, secret, timestamp);
	if (!safeEqualHex(provided, expected)) {
		throw new UnauthorizedException('Invalid webhook signature');
	}
}

/** @deprecated Prefer verifyWebhookSignature. */
export const verifyWahaSignature = verifyWebhookSignature;
