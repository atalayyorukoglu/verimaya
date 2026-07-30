import { describe, expect, it } from 'vitest';
import {
	formatWahaSignatureHeader,
	parseWahaSignatureHeader,
	signWahaPayload,
	verifyWahaSignature,
	WAHA_TIMESTAMP_TOLERANCE_SECONDS
} from './webhooks.signature';

describe('webhooks.signature', () => {
	const secret = 'test-waha-secret';
	const rawBody = '{"event":"message","payload":{"id":"msg-1","body":"hi"}}';
	const ts = 1_700_000_000;

	it('signs and verifies a valid payload', () => {
		const hex = signWahaPayload(rawBody, secret, ts);
		expect(() =>
			verifyWahaSignature({
				rawBody,
				signatureHeader: formatWahaSignatureHeader(hex),
				timestampHeader: String(ts),
				secret,
				nowSeconds: ts
			})
		).not.toThrow();
	});

	it('rejects wrong signature', () => {
		expect(() =>
			verifyWahaSignature({
				rawBody,
				signatureHeader: formatWahaSignatureHeader('ab'.repeat(32)),
				timestampHeader: String(ts),
				secret,
				nowSeconds: ts
			})
		).toThrow(/Invalid webhook signature/);
	});

	it('rejects timestamp outside ±5 minutes', () => {
		const hex = signWahaPayload(rawBody, secret, ts);
		expect(() =>
			verifyWahaSignature({
				rawBody,
				signatureHeader: formatWahaSignatureHeader(hex),
				timestampHeader: String(ts),
				secret,
				nowSeconds: ts + WAHA_TIMESTAMP_TOLERANCE_SECONDS + 1
			})
		).toThrow(/outside allowed window/);
	});

	it('parses v1= hex headers', () => {
		expect(parseWahaSignatureHeader('v1=abc123')).toBe('abc123');
		expect(parseWahaSignatureHeader('v1=')).toBeNull();
		expect(parseWahaSignatureHeader('dev-webhook-secret')).toBeNull();
	});
});
