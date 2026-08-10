import { createAccessControl } from 'better-auth/plugins/access';
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc
} from 'better-auth/plugins/organization/access';
import type { UserRole } from '@verimaya/shared';

/**
 * Verimaya org roles (packages/shared userRoleSchema) mapped onto better-auth AC.
 * Default org resources (organization/member/invitation) kept from better-auth.
 */
/** Exported so reflection-based coverage specs can validate declared permissions. */
export const organizationPermissionStatements = {
	contact: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read', 'update']
} as const;

const statement = {
	...defaultStatements,
	...organizationPermissionStatements
} as const;

export const ac = createAccessControl(statement);

const organizationRolePermissions = {
	owner: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read', 'update']
	},
	admin: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read', 'update']
	},
	manager: {
		contact: ['create', 'read', 'update', 'delete'],
		finance: ['create', 'read', 'update'],
		settings: ['read']
	},
	agent: {
		contact: ['create', 'read', 'update'],
		finance: ['read'],
		settings: ['read']
	},
	finance: {
		contact: ['read'],
		finance: ['create', 'read', 'update', 'delete'],
		settings: ['read']
	},
	readonly: {
		contact: ['read'],
		finance: ['read'],
		settings: ['read']
	}
} as const satisfies Record<
	UserRole,
	{ [Resource in keyof typeof organizationPermissionStatements]: readonly string[] }
>;

export type OrgPermissionResource = keyof typeof organizationPermissionStatements;
export type OrgPermissionAction<Resource extends OrgPermissionResource> =
	(typeof organizationPermissionStatements)[Resource][number];

export function hasOrgPermission<
	Resource extends OrgPermissionResource,
	Action extends OrgPermissionAction<Resource>
>(role: UserRole, resource: Resource, action: Action): boolean {
	const allowedActions = organizationRolePermissions[role][resource] as readonly string[];
	return allowedActions.includes(action);
}

export const owner = ac.newRole({
	...ownerAc.statements,
	...organizationRolePermissions.owner
});

export const admin = ac.newRole({
	...adminAc.statements,
	...organizationRolePermissions.admin
});

export const manager = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissions.manager
});

export const agent = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissions.agent
});

export const finance = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissions.finance
});

export const readonly = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissions.readonly
});
