import { z } from 'zod';
import { userRoleSchema, type UserRole } from './user.js';

/**
 * G-11 — tenant permission overrides.
 *
 * `organizationRolePermissionDefaults` is the **code default** matrix. Tenants may
 * only **restrict** (deny) permissions the default already grants. Grants /
 * privilege escalation are a separate product decision and are intentionally
 * unsupported in this release (document in MIMARI / YAPILACAKLAR Görüş).
 */
export const orgPermissionResourceSchema = z.enum([
	'contact',
	'finance',
	'settings',
	'audit',
	'members',
	'api_keys',
	'webhook_subscriptions',
	'scorecard'
]);
export type OrgPermissionResource = z.infer<typeof orgPermissionResourceSchema>;

export const orgPermissionActionSchema = z.enum(['create', 'read', 'update', 'delete']);
export type OrgPermissionAction = z.infer<typeof orgPermissionActionSchema>;

/** Statement surface for better-auth AC + reflection coverage. */
export const organizationPermissionStatements = {
	contact: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read', 'update'],
	audit: ['read'],
	members: ['create', 'read', 'update', 'delete'],
	api_keys: ['read', 'update'],
	webhook_subscriptions: ['read', 'update'],
	scorecard: ['read', 'update']
} as const satisfies Record<OrgPermissionResource, readonly OrgPermissionAction[]>;

export const organizationRolePermissionDefaults = {
	owner: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read', 'update'],
		audit: ['read'],
		members: ['create', 'read', 'update', 'delete'],
		api_keys: ['read', 'update'],
		webhook_subscriptions: ['read', 'update'],
		scorecard: ['read', 'update']
	},
	admin: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read', 'update'],
		audit: ['read'],
		members: ['create', 'read', 'update', 'delete'],
		api_keys: ['read', 'update'],
		webhook_subscriptions: ['read', 'update'],
		scorecard: ['read', 'update']
	},
	manager: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update'],
		settings: ['read'],
		audit: [],
		members: ['read'],
		api_keys: [],
		webhook_subscriptions: [],
		scorecard: ['read']
	},
	agent: {
		contact: ['create', 'read', 'update'],
		finance: ['read'],
		settings: ['read'],
		audit: [],
		members: [],
		api_keys: [],
		webhook_subscriptions: [],
		scorecard: ['read']
	},
	finance: {
		contact: ['read'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read'],
		audit: [],
		members: [],
		api_keys: [],
		webhook_subscriptions: [],
		scorecard: ['read']
	},
	readonly: {
		contact: ['read'],
		finance: ['read'],
		settings: ['read'],
		audit: [],
		members: [],
		api_keys: [],
		webhook_subscriptions: [],
		scorecard: ['read']
	}
} as const satisfies Record<
	UserRole,
	{ [R in OrgPermissionResource]: readonly OrgPermissionAction[] }
>;

/**
 * Owner cells that must remain granted so a tenant cannot lock itself out of
 * member / permission administration from the panel.
 */
export const OWNER_LOCKED_PERMISSIONS = [
	{ role: 'owner' as const, resource: 'members' as const, action: 'create' as const },
	{ role: 'owner' as const, resource: 'members' as const, action: 'read' as const },
	{ role: 'owner' as const, resource: 'members' as const, action: 'update' as const },
	{ role: 'owner' as const, resource: 'members' as const, action: 'delete' as const },
	{ role: 'owner' as const, resource: 'settings' as const, action: 'read' as const },
	{ role: 'owner' as const, resource: 'settings' as const, action: 'update' as const }
] as const;

/** Persisted override — only `allowed: false` (deny). Existence = restriction. */
export const permissionOverrideSchema = z.object({
	role: userRoleSchema,
	resource: orgPermissionResourceSchema,
	action: orgPermissionActionSchema,
	allowed: z.literal(false)
});
export type PermissionOverride = z.infer<typeof permissionOverrideSchema>;

/**
 * PATCH change: `allowed: false` denies; `allowed: null` resets that cell to the
 * code default (deletes the override row).
 */
export const permissionOverrideChangeSchema = z.object({
	role: userRoleSchema,
	resource: orgPermissionResourceSchema,
	action: orgPermissionActionSchema,
	allowed: z.union([z.literal(false), z.null()])
});
export type PermissionOverrideChange = z.infer<typeof permissionOverrideChangeSchema>;

export const permissionMatrixPatchSchema = z.object({
	changes: z.array(permissionOverrideChangeSchema).min(1).max(200)
});
export type PermissionMatrixPatch = z.infer<typeof permissionMatrixPatchSchema>;

const roleResourceActionsSchema = z.record(
	userRoleSchema,
	z.record(orgPermissionResourceSchema, z.array(orgPermissionActionSchema))
);

export const permissionMatrixLockedCellSchema = z.object({
	role: userRoleSchema,
	resource: orgPermissionResourceSchema,
	action: orgPermissionActionSchema
});

export const permissionMatrixSchema = z.object({
	resources: z.array(orgPermissionResourceSchema),
	roles: z.array(userRoleSchema),
	defaults: roleResourceActionsSchema,
	overrides: z.array(permissionOverrideSchema),
	effective: roleResourceActionsSchema,
	/** Owner self-lock cells — cannot be denied via override. */
	locked: z.array(permissionMatrixLockedCellSchema)
});
export type PermissionMatrix = z.infer<typeof permissionMatrixSchema>;

export function permissionDenyKey(
	role: UserRole,
	resource: OrgPermissionResource,
	action: OrgPermissionAction | string
): string {
	return `${role}:${resource}:${action}`;
}

export function isOwnerLockedPermission(
	role: UserRole,
	resource: OrgPermissionResource,
	action: string
): boolean {
	return OWNER_LOCKED_PERMISSIONS.some(
		(cell) => cell.role === role && cell.resource === resource && cell.action === action
	);
}

/**
 * Single resolution path: code default ∩ ¬tenant deny overrides.
 * Overrides never grant — if the default lacks the action, result is always false.
 */
export function hasOrgPermissionDefault(
	role: UserRole,
	resource: OrgPermissionResource,
	action: OrgPermissionAction,
	deniedKeys?: ReadonlySet<string>
): boolean {
	const allowedActions = organizationRolePermissionDefaults[role][resource] as readonly string[];
	if (!allowedActions.includes(action)) return false;
	if (deniedKeys?.has(permissionDenyKey(role, resource, action))) return false;
	return true;
}

export function buildDefaultPermissionMatrix(): PermissionMatrix['defaults'] {
	const defaults: PermissionMatrix['defaults'] = {
		owner: {} as PermissionMatrix['defaults']['owner'],
		admin: {} as PermissionMatrix['defaults']['admin'],
		manager: {} as PermissionMatrix['defaults']['manager'],
		agent: {} as PermissionMatrix['defaults']['agent'],
		finance: {} as PermissionMatrix['defaults']['finance'],
		readonly: {} as PermissionMatrix['defaults']['readonly']
	};
	for (const role of userRoleSchema.options) {
		for (const resource of orgPermissionResourceSchema.options) {
			defaults[role]![resource] = [
				...organizationRolePermissionDefaults[role][resource]
			] as OrgPermissionAction[];
		}
	}
	return defaults;
}

export function buildEffectivePermissionMatrix(
	deniedKeys: ReadonlySet<string>
): PermissionMatrix['effective'] {
	const defaults = buildDefaultPermissionMatrix();
	const effective: PermissionMatrix['effective'] = {
		owner: {} as PermissionMatrix['effective']['owner'],
		admin: {} as PermissionMatrix['effective']['admin'],
		manager: {} as PermissionMatrix['effective']['manager'],
		agent: {} as PermissionMatrix['effective']['agent'],
		finance: {} as PermissionMatrix['effective']['finance'],
		readonly: {} as PermissionMatrix['effective']['readonly']
	};
	for (const role of userRoleSchema.options) {
		for (const resource of orgPermissionResourceSchema.options) {
			effective[role]![resource] = (defaults[role]![resource] ?? []).filter(
				(action) => !deniedKeys.has(permissionDenyKey(role, resource, action))
			);
		}
	}
	return effective;
}

export function overridesToDeniedKeys(overrides: readonly PermissionOverride[]): Set<string> {
	const keys = new Set<string>();
	for (const row of overrides) {
		keys.add(permissionDenyKey(row.role, row.resource, row.action));
	}
	return keys;
}

export function buildPermissionMatrixFromOverrides(
	overrides: PermissionOverride[]
): PermissionMatrix {
	const deniedKeys = overridesToDeniedKeys(overrides);
	return {
		resources: [...orgPermissionResourceSchema.options],
		roles: [...userRoleSchema.options],
		defaults: buildDefaultPermissionMatrix(),
		overrides,
		effective: buildEffectivePermissionMatrix(deniedKeys),
		locked: OWNER_LOCKED_PERMISSIONS.map((c) => ({
			role: c.role,
			resource: c.resource,
			action: c.action
		}))
	};
}

export const WRITE_ORG_PERMISSION_ACTIONS = ['create', 'update', 'delete'] as const satisfies readonly OrgPermissionAction[];
