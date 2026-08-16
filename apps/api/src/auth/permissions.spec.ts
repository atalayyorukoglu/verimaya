import { describe, expect, it } from 'vitest';
import {
	buildEffectivePermissionMatrix,
	hasOrgPermission,
	isOwnerLockedPermission,
	overridesToDeniedKeys,
	permissionDenyKey
} from './permissions';

describe('G-11 permission resolution (pure)', () => {
	it('defaults grant agent finance:read and deny finance:update', () => {
		expect(hasOrgPermission('agent', 'finance', 'read')).toBe(true);
		expect(hasOrgPermission('agent', 'finance', 'update')).toBe(false);
	});

	it('deny override removes a default grant without granting anything new', () => {
		const denied = overridesToDeniedKeys([
			{ role: 'agent', resource: 'finance', action: 'read', allowed: false }
		]);
		expect(hasOrgPermission('agent', 'finance', 'read', denied)).toBe(false);
		expect(hasOrgPermission('readonly', 'finance', 'delete', denied)).toBe(false);
	});

	it('owner locked cells are detected', () => {
		expect(isOwnerLockedPermission('owner', 'members', 'create')).toBe(true);
		expect(isOwnerLockedPermission('owner', 'members', 'update')).toBe(true);
		expect(isOwnerLockedPermission('owner', 'members', 'delete')).toBe(true);
		expect(isOwnerLockedPermission('owner', 'settings', 'read')).toBe(true);
		expect(isOwnerLockedPermission('admin', 'members', 'update')).toBe(false);
		expect(isOwnerLockedPermission('owner', 'finance', 'read')).toBe(false);
	});

	it('defaults grant owner/admin members create/delete and deny agent/manager', () => {
		expect(hasOrgPermission('owner', 'members', 'create')).toBe(true);
		expect(hasOrgPermission('owner', 'members', 'delete')).toBe(true);
		expect(hasOrgPermission('admin', 'members', 'create')).toBe(true);
		expect(hasOrgPermission('admin', 'members', 'delete')).toBe(true);
		expect(hasOrgPermission('manager', 'members', 'create')).toBe(false);
		expect(hasOrgPermission('manager', 'members', 'delete')).toBe(false);
		expect(hasOrgPermission('agent', 'members', 'create')).toBe(false);
		expect(hasOrgPermission('agent', 'members', 'delete')).toBe(false);
	});

	it('effective matrix subtracts denies from defaults', () => {
		const denied = new Set([permissionDenyKey('agent', 'finance', 'read')]);
		const effective = buildEffectivePermissionMatrix(denied);
		expect(effective.agent.finance).not.toContain('read');
		expect(effective.admin.finance).toContain('read');
	});
});
