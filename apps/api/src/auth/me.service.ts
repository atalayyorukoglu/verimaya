import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { userRoleSchema, type MembershipUser } from '@verimaya/shared';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { member, user } from '../db/schema';

type ResolveMembershipInput = {
	userId: string;
	activeOrganizationId: string | null | undefined;
	requestId: string;
};

@Injectable()
export class MeService {
	constructor(private readonly db: DbService) {}

	async resolveMembershipUser({
		userId,
		activeOrganizationId,
		requestId
	}: ResolveMembershipInput): Promise<MembershipUser> {
		if (!activeOrganizationId) {
			throw new BadRequestException({
				error: {
					code: 'active_organization_required',
					message: 'Active organization is required'
				},
				request_id: requestId
			});
		}

		const [membership] = await this.db.client
			.select({
				id: user.id,
				email: user.email,
				displayName: user.name,
				createdAt: user.createdAt,
				role: member.role
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(
				and(
					eq(member.organizationId, activeOrganizationId),
					eq(member.userId, userId)
				)
			)
			.limit(1);

		const role = membership ? userRoleSchema.safeParse(membership.role) : undefined;
		if (!membership || !role?.success) {
			throw new ForbiddenException({
				error: {
					code: 'organization_membership_required',
					message: 'Active organization membership is required'
				},
				request_id: requestId
			});
		}

		return {
			id: membership.id,
			email: membership.email,
			display_name: membership.displayName,
			created_at: membership.createdAt.toISOString(),
			tenant_id: activeOrganizationId,
			role: role.data
		};
	}
}
