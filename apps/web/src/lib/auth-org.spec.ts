import { describe, expect, it } from 'vitest';
import { resolveOrganizationGate, type OrganizationSummary } from './auth-org-gate';

const liveA: OrganizationSummary = {
	id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	name: 'A',
	slug: 'a'
};
const liveB: OrganizationSummary = {
	id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	name: 'B',
	slug: 'b'
};
const deletedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('resolveOrganizationGate', () => {
	it('proceeds when the active org is still in the live list', () => {
		expect(resolveOrganizationGate(liveA.id, [liveA, liveB])).toEqual({ action: 'proceed' });
	});

	it('does not proceed when the session active org is absent (soft-deleted)', () => {
		expect(resolveOrganizationGate(deletedId, [liveA, liveB])).toEqual({
			action: 'pick',
			organizations: [liveA, liveB]
		});
	});

	it('auto-activates the remaining live org when the active one was deleted', () => {
		expect(resolveOrganizationGate(deletedId, [liveA])).toEqual({
			action: 'activate',
			organizationId: liveA.id
		});
	});

	it('does not auto-pick a missing id as orgs[0]', () => {
		expect(resolveOrganizationGate(null, [liveA])).toEqual({
			action: 'activate',
			organizationId: liveA.id
		});
		expect(resolveOrganizationGate(deletedId, [])).toEqual({ action: 'create' });
	});
});
