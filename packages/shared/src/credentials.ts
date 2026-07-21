import { z } from 'zod';

export const credentialUpsertSchema = z.object({
	secret: z.string().min(1).max(8000)
});

export type CredentialUpsert = z.infer<typeof credentialUpsertSchema>;

export const credentialStatusSchema = z.object({
	configured: z.boolean(),
	key_version: z.number().int().positive().optional()
});

export type CredentialStatus = z.infer<typeof credentialStatusSchema>;
