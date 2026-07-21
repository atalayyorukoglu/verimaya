import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { MembershipUser, UserRole } from '@verimaya/shared';
import { member, user } from '../db/schema';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { TenantContextService } from '../tenant/tenant-context.service';

type MemberRow = {
	id: string;
	role: string;
	createdAt: Date;
	email: string;
	displayName: string;
};

function toMembershipUser(row: MemberRow, tenantId: string): MembershipUser {
	return {
		id: row.id,
		tenant_id: tenantId,
		email: row.email,
		display_name: row.displayName,
		role: row.role as UserRole,
		created_at: row.createdAt.toISOString()
	};
}

@Injectable()
export class MembersService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(member.createdAt, member.id, params.cursor);
			const filters = [eq(member.organizationId, tenantId)];
			if (cursorCond) filters.push(cursorCond);

			const rows = await db
				.select({
					id: member.id,
					role: member.role,
					createdAt: member.createdAt,
					email: user.email,
					displayName: user.name
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id))
				.where(and(...filters))
				.orderBy(desc(member.createdAt), desc(member.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map((row) => toMembershipUser(row, tenantId)),
				next_cursor: page.next_cursor
			};
		});
	}
}
