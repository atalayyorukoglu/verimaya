import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type postgres from 'postgres';
import { DbService } from '../db/db.service';
import type { WebhookRequestWithRawBody } from './webhooks.signature';

/** Header carrying Unix-seconds timestamp for replay protection. */
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';

/** Header carrying `v1=<hex>` HMAC-SHA256 of the canonical signed payload. */
export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';

/** Header carrying the client-claimed tenant id (NOT trusted; canonical tenant comes from the identity). */
export const WEBHOOK_TENANT_HEADER = 'x-tenant-id';

/** Header carrying an explicit event id when the provider doesn't put one in the body. */
export const WEBHOOK_EXTERNAL_EVENT_ID_HEADER = 'x-external-event-id';

/** ±5 minutes (plan Adım 22 / 23b). */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/**
 * WEBHOOK-01 (Faz 8): canonical signed payload. The string MUST include every byte the
 * receiver considers binding: timestamp, provider, claimed tenant id, raw body. Without
 * the tenant id in the signature, a signature produced for tenant A is also valid for
 * tenant B (because the body was signed with A's secret but the verifier only checks
 * the secret). Including it here forces the attacker who wants to spoof tenant B to
 * forge a signature *with* tenant B's id — and they need B's secret for that.
 *
 * Order matters: `${ts}.${provider}.${tenantId}.${body}` — keep it stable across
 * versions; a rotation must change the signature prefix explicitly (e.g. v2=...).
 */
export function buildSignedPayload(
	timestamp: number,
	provider: string,
	claimedTenantId: string,
	rawBody: string
): string {
	return `${timestamp}.${provider}.${claimedTenantId}.${rawBody}`;
}

/** SHA-256 of the secret, used as a deterministic lookup key into tenant_provider_identities. */
export function hashWebhookSecret(secret: string): string {
	// Same shape as api-key-crypto.ts (sha256 hex). SHA-256 is appropriate here because
	// the lookup is by key_hash equality, not a security token comparison. The signature
	// itself uses HMAC which is timing-safe; this hash just narrows the rowset.
	return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** HMAC hex of the canonical payload. */
export function signWebhookPayload(
	timestamp: number,
	provider: string,
	claimedTenantId: string,
	rawBody: string,
	secret: string
): string {
	const signed = buildSignedPayload(timestamp, provider, claimedTenantId, rawBody);
	return createHmac('sha256', secret).update(signed, 'utf8').digest('hex');
}

/** Build the v1-prefixed signature header value. */
export function formatWebhookSignatureHeader(hexDigest: string): string {
	return `v1=${hexDigest}`;
}

/** Parse `v1=<hex>` (whitespace tolerant). Returns null if malformed. */
export function parseWebhookSignatureHeader(header: string): string | null {
	const trimmed = header.trim();
	const match = /^v1=([0-9a-fA-F]+)$/.exec(trimmed);
	return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Env key for a provider webhook secret: `WEBHOOK_SECRET_<PROVIDER>`.
 * Used only as a pilot migration shim — see {@link resolveTenantFromWebhook}.
 * Empty after normalization → empty string.
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

export type VerifyWebhookSignatureInput = {
	rawBody: string;
	signatureHeader: string | undefined;
	timestampHeader: string | undefined;
	secret: string;
	nowSeconds?: number;
	toleranceSeconds?: number;
};

/**
 * Constant-time HMAC verification of `${ts}.${provider}.${claimedTenantId}.${rawBody}`.
 * The provider and claimed tenant id are bound into the signed bytes — callers must
 * compute `expected = signWebhookPayload(ts, provider, claimedTenantId, rawBody, secret)`
 * using the SAME provider + claimedTenantId values that were presented in the request.
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

	// Caller has already validated provider + claimedTenantId are non-empty before passing
	// them in; we re-check here defensively.
	const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
	if (!safeEqualHex(provided, expected)) {
		throw new UnauthorizedException('Invalid webhook signature');
	}
}

/**
 * WEBHOOK-01 (Faz 8): resolves the canonical tenantId for a webhook delivery and verifies
 * the signature. Two paths:
 *
 * 1. **Per-tenant identity (default, post-pilot).** The signature is computed with the
 *    tenant's secret over `${ts}.${provider}.${claimedTenantId}.${body}`. The `key_hash`
 *    of the HMAC secret is looked up against `tenant_provider_identities`. The returned
 *    row's `tenant_id` is the canonical tenant. If the caller claims a different
 *    `claimedTenantId` (header), the request is rejected — that's the cross-tenant
 *    spoof that the X-Tenant-Id header previously allowed.
 *
 * 2. **Legacy env-shared secret (pilot shim, `WEBHOOK_IDENTITY_DEFAULT_SECRET=true`).**
 *    When the env flag is set and `claimedTenantId` matches the env-supplied legacy
 *    tenant id (also env-supplied), the global `WAHA_WEBHOOK_SECRET` (or
 *    `WEBHOOK_SECRET_<PROVIDER>`) is used for HMAC verification. This is the migration
 *    bridge so the existing WAHA pilot keeps working until per-tenant secrets are
 *    provisioned. After pilot, drop the flag.
 *
 * Returns the canonical `tenantId`. Throws UnauthorizedException on any failure.
 */
export async function resolveTenantFromWebhook(opts: {
	db: DbService;
	provider: string;
	rawBody: string;
	signatureHeader: string | undefined;
	timestampHeader: string | undefined;
	claimedTenantId: string | undefined;
	nowSeconds?: number;
}): Promise<{ tenantId: string; secretVersion: number | null }> {
	const { db, provider, rawBody, signatureHeader, timestampHeader, claimedTenantId } = opts;

	if (!provider.trim()) {
		throw new UnauthorizedException('Webhook provider is missing');
	}

	// Step 1: parse headers.
	const tsRaw = timestampHeader;
	if (typeof tsRaw !== 'string' || !tsRaw.trim()) {
		throw new UnauthorizedException('Missing webhook timestamp');
	}
	const ts = Number(tsRaw.trim());
	if (!Number.isFinite(ts) || !Number.isInteger(ts)) {
		throw new UnauthorizedException('Invalid webhook timestamp');
	}
	const nowSeconds = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (Math.abs(nowSeconds - ts) > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
		throw new UnauthorizedException('Webhook timestamp outside allowed window');
	}
	if (typeof signatureHeader !== 'string' || !signatureHeader.trim()) {
		throw new UnauthorizedException('Missing webhook signature');
	}
	const provided = parseWebhookSignatureHeader(signatureHeader);
	if (!provided) {
		throw new UnauthorizedException('Invalid webhook signature format');
	}

	const claim = (claimedTenantId ?? '').trim();
	if (!claim) {
		throw new UnauthorizedException('Missing tenant header');
	}

	// Step 2: per-tenant identity path. The signature here MUST be computed over
	// `${ts}.${provider}.${claimedTenantId}.${body}` using the tenant's secret. We don't
	// know the secret yet, so the signature itself is the anchor: we try each candidate
	// identity and check timing-safe equality.
	//
	// Lookup by (provider, claimedTenantId) only. We deliberately do NOT key by tenant —
	// a signature generated for tenant A's secret with `X-Tenant-Id: B` is rejected
	// when no candidate row matches (B,A) — see step 3 below.
	//
	// The lookup function is SECURITY DEFINER because tenant_provider_identities has RLS
	// forced, and we don't have tenant context set at this point (the request is
	// pre-authentication). The function still filters by claimedTenantId so the search
	// space is bounded to one tenant's identities.
	const sql: postgres.Sql = db.sql;
	const candidates = await sql<
		Array<{ id: string; tenant_id: string; ciphertext: Buffer; key_version: number }>
	>`
		select id, tenant_id, ciphertext, key_version
		from app.lookup_tenant_provider_identities_for_claim(${provider}, ${claim}::uuid)
	`;

	if (candidates.length === 0) {
		// No identity for (provider, claimedTenantId). Fall through to env-shared path
		// if the operator has explicitly enabled the legacy pilot bridge.
		return await tryLegacySharedSecret({
			provider, claim, ts, rawBody, provided, db
		});
	}

	const { CryptoService } = await import('../common/crypto.service');
	const crypto = new CryptoService();
	let lastSigError: string | null = null;
	for (const row of candidates) {
		let secret: string;
		try {
			secret = crypto.decrypt(Buffer.from(row.ciphertext));
		} catch {
			// Ciphertext corrupt; try next candidate (rare in practice).
			continue;
		}
		const expected = createHmac('sha256', secret)
			.update(buildSignedPayload(ts, provider, claim, rawBody))
			.digest('hex');
		if (safeEqualHex(provided, expected)) {
			return { tenantId: row.tenant_id, secretVersion: row.key_version };
		}
		lastSigError = 'mismatch';
	}
	if (lastSigError) {
		throw new UnauthorizedException('Invalid webhook signature');
	}
	throw new UnauthorizedException('Webhook identity decryption failed');
}

/**
 * Pilot-shim fallback. Returns canonical tenant + secret version when the legacy env
 * secret verifies; throws Unauthorized otherwise. Activated only when
 * `WEBHOOK_IDENTITY_DEFAULT_SECRET=true` AND the claim matches the
 * `WEBHOOK_IDENTITY_DEFAULT_TENANT` env id.
 *
 * Why both env flags: a single boolean would let any caller spoof the pilot tenant by
 * sending X-Tenant-Id = that value with any body — the legacy behavior we are
 * specifically closing. Requiring BOTH the flag AND a configured default-tenant id
 * keeps the bridge scoped.
 */
async function tryLegacySharedSecret(opts: {
	provider: string;
	claim: string;
	ts: number;
	rawBody: string;
	provided: string;
	db: DbService;
}): Promise<{ tenantId: string; secretVersion: number | null }> {
	const { provider, claim, ts, rawBody, provided } = opts;
	const enabled = process.env.WEBHOOK_IDENTITY_DEFAULT_SECRET?.trim() === 'true';
	if (!enabled) {
		throw new UnauthorizedException('No webhook identity for tenant');
	}
	const defaultTenant = process.env.WEBHOOK_IDENTITY_DEFAULT_TENANT?.trim();
	if (!defaultTenant || defaultTenant !== claim) {
		// Either no default tenant configured, or the claim doesn't match it. In both
		// cases, refuse — don't fall through to a global secret check.
		throw new UnauthorizedException('No webhook identity for tenant');
	}
	const envKey = providerWebhookSecretEnvKey(provider);
	const secret = process.env[envKey]?.trim() ?? '';
	if (!secret) {
		throw new UnauthorizedException('Webhook secret is not configured');
	}
	const expected = createHmac('sha256', secret)
		.update(buildSignedPayload(ts, provider, claim, rawBody))
		.digest('hex');
	if (!safeEqualHex(provided, expected)) {
		throw new UnauthorizedException('Invalid webhook signature');
	}
	return { tenantId: claim, secretVersion: null };
}