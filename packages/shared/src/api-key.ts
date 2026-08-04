import { z } from 'zod';
import { isoDateTime } from './common.js';

export const apiKeyScopeSchema = z.enum(['read', 'write']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeyCreateSchema = z.object({
	name: z.string().trim().min(1).max(120),
	scopes: z.array(apiKeyScopeSchema).min(1),
	// AUDIT-03 (Faz 8): optional explicit expiry. NULL = service default (90 days).
	// 90-day default is conservative for machine-to-machine credentials; admins can
	// extend on issuance for long-lived integrations.
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
