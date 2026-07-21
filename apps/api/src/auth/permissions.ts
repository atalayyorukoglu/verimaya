import { createAccessControl } from 'better-auth/plugins/access';
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc
} from 'better-auth/plugins/organization/access';

/**
 * Verimaya org roles (packages/shared userRoleSchema) mapped onto better-auth AC.
 * Default org resources (organization/member/invitation) kept from better-auth.
 */
const statement = {
	...defaultStatements,
	patient: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read', 'update']
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
	...ownerAc.statements,
	patient: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read', 'update']
});

export const admin = ac.newRole({
	...adminAc.statements,
	patient: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read', 'update']
});

export const manager = ac.newRole({
	...memberAc.statements,
	patient: ['create', 'read', 'update', 'delete'],
	finance: ['create', 'read', 'update'],
	settings: ['read']
});

export const agent = ac.newRole({
	...memberAc.statements,
	patient: ['create', 'read', 'update'],
	finance: ['read'],
	settings: ['read']
});

export const finance = ac.newRole({
	...memberAc.statements,
	patient: ['read'],
	finance: ['create', 'read', 'update', 'delete'],
	settings: ['read']
});

export const readonly = ac.newRole({
	...memberAc.statements,
	patient: ['read'],
	finance: ['read'],
	settings: ['read']
});
