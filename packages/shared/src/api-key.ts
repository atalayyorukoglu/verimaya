import { z } from 'zod';
import { isoDateTime } from './common.js';

/**
 * AUDIT-F09-02 — per-key API scopes are `resource:action` strings (same vocabulary as
 * org RBAC). Stored as JSONB on `api_keys.scopes`. Deny-by-default: a key may only call
 * handlers whose `@RequireOrgPermission` matches an explicit scope.
 *
 * Session-only surfaces (no AuthOrApiKeyGuard) reject API keys at SessionGuard regardless
 * of scopes — including `/v1/audit-logs`, `/v1/me/data-export`, `/v1/me/data-deletion-request`,
 * `/v1/api-keys`, `/v1/members`, `/v1/webhook-subscriptions`, `/v1/scorecard`, `/v1/settings/*`,
 * `/v1/tenants`, `/v1/ad-metrics`.
 */
export const apiKeyScopeSchema = z.enum([
	'contact:create',
	'contact:read',
	'contact:update',
	'contact:delete',
	'finance:create',
	'finance:read',
	'finance:update',
	'finance:delete',
	'settings:read',
	'settings:update',
	'audit:read',
	'members:read',
	'members:update',
	'api_keys:read',
	'api_keys:update',
	'webhook_subscriptions:read',
	'webhook_subscriptions:update',
	'scorecard:read',
	'scorecard:update'
]);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

/** Issuance UX + migrations: scopes that AuthOrApiKey domain routes actually enforce. */
export const API_KEY_MACHINE_SCOPES = [
	'contact:create',
	'contact:read',
	'contact:update',
	'contact:delete',
	'finance:create',
	'finance:read',
	'finance:update',
	'finance:delete',
	'settings:read',
	'settings:update'
] as const satisfies readonly ApiKeyScope[];

/**
 * Legacy `['read']` effective power on AuthOrApiKey routes (pre-AUDIT-F09-02).
 * Does not include session-only admin resources (audit/members/api_keys/…).
 */
export const LEGACY_API_KEY_READ_SCOPES = [
	'contact:read',
	'finance:read',
	'settings:read'
] as const satisfies readonly ApiKeyScope[];

/**
 * Legacy `['write']` (alone or with read) effective power — write keys could also GET.
 * Same AuthOrApiKey surface; no silent expansion into session-only resources.
 */
export const LEGACY_API_KEY_WRITE_SCOPES = [
	'contact:create',
	'contact:read',
	'contact:update',
	'contact:delete',
	'finance:create',
	'finance:read',
	'finance:update',
	'finance:delete',
	'settings:read',
	'settings:update'
] as const satisfies readonly ApiKeyScope[];

export function apiKeyHasScope(
	scopes: readonly string[],
	resource: string,
	action: string
): boolean {
	const token = `${resource}:${action}`;
	return scopes.includes(token);
}

export const apiKeyCreateSchema = z.object({
	name: z.string().trim().min(1).max(120),
	scopes: z.array(apiKeyScopeSchema).min(1),
	// AUDIT-03 (Faz 8): optional explicit expiry. NULL = service default (90 days).
	expires_at: z.coerce.date().nullable().optional()
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export const apiKeySchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid(),
	name: z.string(),
	key_prefix: z.string(),
	scopes: z.array(apiKeyScopeSchema),
	created_at: isoDateTime,
	last_used_at: isoDateTime.nullable(),
	expires_at: isoDateTime.nullable(),
	revoked_at: isoDateTime.nullable()
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Plaintext key returned once on create; never stored or listed again. */
export const apiKeyCreatedSchema = apiKeySchema.extend({
	key: z.string()
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
