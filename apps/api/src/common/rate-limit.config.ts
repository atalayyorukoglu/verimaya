/**
 * AUDIT-03 rate-limit helpers (prod hotfix).
 *
 * Strict 10/min bucket must cover credential-bearing better-auth routes only —
 * not session reads (`get-session`) or org navigation (`organization/*`).
 *
 * Path names verified against better-auth@1.6.23 with plugins enabled in
 * `apps/api/src/auth/auth.ts`: bearer, organization, twoFactor + emailAndPassword.
 */

/** Prefixes (after stripping query). Exact path or `prefix/` matches. */
const STRICT_AUTH_PATH_PREFIXES = [
	'/v1/auth/sign-in',
	'/v1/auth/sign-up',
	// Current password-reset request (web: authClient.requestPasswordReset).
	'/v1/auth/request-password-reset',
	'/v1/auth/reset-password',
	// Legacy alias still listed in better-auth's own special-rule matchers.
	'/v1/auth/forget-password',
	// Signed-in password change (current + new) — credential-bearing.
	'/v1/auth/change-password',
	// 2FA verification during login (TOTP + backup; verify-otp exists on the plugin).
	'/v1/auth/two-factor/verify-totp',
	'/v1/auth/two-factor/verify-backup-code',
	'/v1/auth/two-factor/verify-otp'
] as const;

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
	return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True → count toward the strict 10/min auth bucket. */
export function isStrictAuthRateLimitedPath(pathname: string): boolean {
	return STRICT_AUTH_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

/**
 * allowList callback for the strict auth rate-limit register:
 * return true → skip this limiter (path stays under global 600/min only).
 */
export function skipStrictAuthRateLimit(req: { url: string }): boolean {
	const path = req.url.split('?')[0] ?? '';
	return !isStrictAuthRateLimitedPath(path);
}

export type TrustProxyOption = boolean | number | string | string[];

/**
 * Parse TRUST_PROXY for Fastify `trustProxy`.
 * Default off — X-Forwarded-For must not be trustable from the public internet.
 *
 * Accepted values:
 * - unset / '' / 'false' / 'off' / '0' → false
 * - 'true' / 'on' → true (discouraged; prefer hop count)
 * - positive integer string → hop count (prod Coolify: usually `1`)
 * - comma-separated → string[] (CIDRs / proxy IPs)
 * - otherwise → single string (CIDR or IP)
 */
export function parseTrustProxyEnv(raw: string | undefined): TrustProxyOption {
	if (raw === undefined) return false;
	const v = raw.trim();
	if (v === '') return false;

	const lower = v.toLowerCase();
	if (lower === 'false' || lower === 'off' || lower === '0') return false;
	if (lower === 'true' || lower === 'on') return true;

	if (/^\d+$/.test(v)) {
		const n = Number(v);
		if (n === 0) return false;
		return n;
	}

	if (v.includes(',')) {
		const parts = v
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
		return parts.length === 0 ? false : parts.length === 1 ? parts[0]! : parts;
	}

	return v;
}
