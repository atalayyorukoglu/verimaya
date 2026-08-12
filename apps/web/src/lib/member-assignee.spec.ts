import { describe, expect, it } from 'vitest';
import type { MembershipUser } from '@verimaya/shared';
import { memberAssigneeUserId, memberMatchesAssignee } from './member-assignee';

describe('memberAssigneeUserId', () => {
	const member = {
		id: '11111111-1111-4111-8111-111111111111',
		user_id: '22222222-2222-4222-8222-222222222222',
		email: 'agent@example.com',
		display_name: 'Agent',
		created_at: '2026-01-01T00:00:00.000Z',
		tenant_id: '33333333-3333-4333-8333-333333333333',
		role: 'agent'
	} satisfies MembershipUser;

	it('prefers user_id for assignee FK', () => {
		expect(memberAssigneeUserId(member)).toBe(member.user_id);
	});

	it('falls back to membership id for legacy payloads', () => {
		const legacy = { ...member, user_id: undefined as unknown as string };
		expect(memberAssigneeUserId(legacy)).toBe(member.id);
	});

	it('matches stored assignee against either id shape', () => {
		expect(memberMatchesAssignee(member, member.user_id)).toBe(true);
		expect(memberMatchesAssignee(member, member.id)).toBe(true);
	});
});
