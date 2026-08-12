import type { MembershipUser } from '@verimaya/shared';

/**
 * Auth user id for `contacts.assigned_user_id`.
 * `/v1/members` item `id` is the membership row; FK targets `user.id`.
 * Fallback keeps older API payloads working until `user_id` is present everywhere.
 */
export function memberAssigneeUserId(member: MembershipUser): string {
	return member.user_id ?? member.id;
}

export function memberMatchesAssignee(member: MembershipUser, assignedUserId: string): boolean {
	const assigneeId = memberAssigneeUserId(member);
	return assigneeId === assignedUserId || member.id === assignedUserId;
}
