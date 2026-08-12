import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';
import { userUiPreferencesSchema } from './product-modules.js';
import { tenantSchema } from './tenant.js';
import { membershipUserSchema, userRoleSchema } from './user.js';

/** Session user profile — org membership + platform flag (not org RBAC). */
export const meSchema = membershipUserSchema.extend({
	platform_admin: z.boolean(),
	/** Per user + active org UI prefs (e.g. Ürünlerde Göster modules). */
	preferences: userUiPreferencesSchema
});

export type Me = z.infer<typeof meSchema>;

/**
 * Session user's better-auth organizations, intersected with `tenants`
 * (`deleted_at IS NULL`). Soft-deleted tenants never appear.
 */
export const meOrganizationSchema = z.object({
	id: uuid,
	name: z.string().min(1).max(255),
	slug: z.string().min(1).max(64)
});

export type MeOrganization = z.infer<typeof meOrganizationSchema>;

export const meOrganizationListSchema = z.object({
	items: z.array(meOrganizationSchema)
});

/** Platform list includes soft-deleted tenants (`deleted_at`). */
export const platformTenantSchema = tenantSchema.extend({
	deleted_at: isoDateTime.nullable().default(null)
});

export type PlatformTenant = z.infer<typeof platformTenantSchema>;

export const platformTenantCreateSchema = z.object({
	name: z.string().trim().min(1).max(255),
	/** When true (default), the calling platform admin becomes `owner`. */
	grant_self_admin: z.boolean().default(true)
});

export type PlatformTenantCreate = z.infer<typeof platformTenantCreateSchema>;

export const platformTenantUpdateSchema = z.object({
	name: z.string().trim().min(1).max(255)
});

export type PlatformTenantUpdate = z.infer<typeof platformTenantUpdateSchema>;

export const platformMemberUpsertSchema = z.object({
	email: z.string().trim().email().max(255),
	password: z.string().min(8).max(128),
	display_name: z.string().trim().min(1).max(255),
	role: userRoleSchema.default('agent')
});

export type PlatformMemberUpsert = z.infer<typeof platformMemberUpsertSchema>;

export const platformTenantListSchema = z.object({
	items: z.array(platformTenantSchema)
});

export const platformMemberListSchema = z.object({
	items: z.array(membershipUserSchema)
});

export const platformSoftDeleteResultSchema = z.object({
	id: uuid,
	deleted_at: isoDateTime
});
