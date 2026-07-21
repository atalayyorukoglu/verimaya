import { z } from 'zod';
import { isoDateTime } from './common.js';

export const apiKeyScopeSchema = z.enum(['read', 'write']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const apiKeyCreateSchema = z.object({
	name: z.string().trim().min(1).max(120),
	scopes: z.array(apiKeyScopeSchema).min(1)
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;

export const apiKeySchema = z.object({
	id: z.string().uuid(),
	tenant_id: z.string().uuid(),
	name: z.string(),
	key_prefix: z.string(),
	scopes: z.array(apiKeyScopeSchema),
	created_at: isoDateTime,
	revoked_at: isoDateTime.nullable()
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/** Plaintext key returned once on create; never stored or listed again. */
export const apiKeyCreatedSchema = apiKeySchema.extend({
	key: z.string()
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;
