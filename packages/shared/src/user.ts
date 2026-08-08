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
	tenant_id: uuid,
	role: userRoleSchema
});

export type MembershipUser = z.infer<typeof membershipUserSchema>;

/** PATCH /v1/members/:id — org admin changes a member's role. */
export const memberUpdateSchema = z.object({
	role: userRoleSchema
});

export type MemberUpdate = z.infer<typeof memberUpdateSchema>;
