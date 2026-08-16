import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const userRoleSchema = z.enum([
	'owner',
	'admin',
	'manager',
	'agent',
	'finance',
	'readonly'
]);

export type UserRole = z.infer<typeof userRoleSchema>;

export const userSchema = z.object({
	id: uuid,
	email: z.string().email().max(255),
	display_name: z.string().min(1).max(255),
	created_at: isoDateTime
});

export type User = z.infer<typeof userSchema>;

/** User as seen inside a tenant (membership-scoped). */
export const membershipUserSchema = userSchema.extend({
	/** Auth user id — use for FKs such as contacts.assigned_user_id */
	user_id: uuid,
	tenant_id: uuid,
	role: userRoleSchema
});

export type MembershipUser = z.infer<typeof membershipUserSchema>;

/** POST /v1/members — add a member to the active tenant (owner/admin). */
export const memberCreateSchema = z.object({
	email: z.string().trim().email().max(255),
	password: z.string().min(8).max(128),
	display_name: z.string().trim().min(1).max(255),
	role: userRoleSchema.default('agent')
});

export type MemberCreate = z.infer<typeof memberCreateSchema>;

/**
 * PATCH /v1/members/:id — change role and/or set password.
 * At least one field must be present.
 */
export const memberUpdateSchema = z
	.object({
		role: userRoleSchema.optional(),
		password: z.string().min(8).max(128).optional()
	})
	.refine((value) => value.role !== undefined || value.password !== undefined, {
		message: 'At least one of role or password is required'
	});

export type MemberUpdate = z.infer<typeof memberUpdateSchema>;

/** POST /v1/members/:id/password-reset — send better-auth reset email (admin/owner). */
export const memberPasswordResetResultSchema = z.object({
	sent: z.literal(true)
});

export type MemberPasswordResetResult = z.infer<typeof memberPasswordResetResultSchema>;
