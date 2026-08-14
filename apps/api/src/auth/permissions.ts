import { createAccessControl } from 'better-auth/plugins/access';
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc
} from 'better-auth/plugins/organization/access';
import type { UserRole } from '@verimaya/shared';
import {
	hasOrgPermissionDefault,
	organizationPermissionStatements,
	organizationRolePermissionDefaults,
	type OrgPermissionAction as SharedOrgPermissionAction,
	type OrgPermissionResource as SharedOrgPermissionResource
} from '@verimaya/shared';

/**
 * Verimaya org roles mapped onto better-auth AC.
 *
 * AUDIT-F09-02 / G-11: statements + role defaults live in `@verimaya/shared`
 * (`permission-matrix.ts`) so API enforcement, settings matrix, and MSW share one
 * code-default source. Tenant overrides are deny-only; resolution is always
 * `hasOrgPermission(role, resource, action, deniedKeys)`.
 */
export { organizationPermissionStatements };

const statement = {
	...defaultStatements,
	...organizationPermissionStatements
} as const;

export const ac = createAccessControl(statement);

/** @deprecated alias — prefer `organizationRolePermissionDefaults` from shared. */
export const organizationRolePermissions = organizationRolePermissionDefaults;

export {
	OWNER_LOCKED_PERMISSIONS,
	buildDefaultPermissionMatrix,
	buildEffectivePermissionMatrix,
	isOwnerLockedPermission,
	overridesToDeniedKeys,
	permissionDenyKey
} from '@verimaya/shared';

export type OrgPermissionResource = SharedOrgPermissionResource;
export type OrgPermissionAction<Resource extends OrgPermissionResource = OrgPermissionResource> =
	(typeof organizationPermissionStatements)[Resource][number];

/**
 * Single resolution path: code default ∩ ¬tenant deny overrides.
 * `deniedKeys` entries are `permissionDenyKey(role, resource, action)`.
 */
export function hasOrgPermission<
	Resource extends OrgPermissionResource,
	Action extends OrgPermissionAction<Resource>
>(
	role: UserRole,
	resource: Resource,
	action: Action,
	deniedKeys?: ReadonlySet<string>
): boolean {
	return hasOrgPermissionDefault(role, resource, action, deniedKeys);
}

export const owner = ac.newRole({
	...ownerAc.statements,
	...organizationRolePermissionDefaults.owner
});

export const admin = ac.newRole({
	...adminAc.statements,
	...organizationRolePermissionDefaults.admin
});

export const manager = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissionDefaults.manager
});

export const agent = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissionDefaults.agent
});

export const finance = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissionDefaults.finance
});

export const readonly = ac.newRole({
	...memberAc.statements,
	...organizationRolePermissionDefaults.readonly
});
