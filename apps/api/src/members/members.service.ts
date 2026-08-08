import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';
import type { MemberRoleUpdate, MembershipUser, UserRole } from '@verimaya/shared';
import { member, user } from '../db/schema';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

type MemberRow = {
	id: string;
	role: string;
	createdAt: Date;
	email: string;
	displayName: string;
};

type MemberWithUserId = MemberRow & { userId: string };

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

	async updateRole(
		tenantId: string,
		memberId: string,
		input: MemberRoleUpdate,
		actor: AuditActor
	): Promise<MembershipUser> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await this.findMemberRow(db, tenantId, memberId);

			if (actor.actorId && existing.userId === actor.actorId) {
				throw new ForbiddenException({
					error: {
						code: 'cannot_change_own_role',
						message: 'You cannot change your own role'
					}
				});
			}

			const nextRole = input.role;
			if (existing.role === 'owner' && nextRole !== 'owner') {
				const [{ value: ownerCount }] = await db
					.select({ value: count() })
					.from(member)
					.where(and(eq(member.organizationId, tenantId), eq(member.role, 'owner')));

				if (Number(ownerCount) <= 1) {
					throw new BadRequestException({
						error: {
							code: 'last_owner',
							message: 'Cannot demote the last owner'
						}
					});
				}
			}

			if (existing.role === nextRole) {
				return toMembershipUser(existing, tenantId);
			}

			const [row] = await db
				.update(member)
				.set({ role: nextRole })
				.where(and(eq(member.id, memberId), eq(member.organizationId, tenantId)))
				.returning({
					id: member.id,
					role: member.role,
					createdAt: member.createdAt,
					userId: member.userId
				});

			if (!row) {
				throw new NotFoundException({
					error: { code: 'not_found', message: 'Member not found' }
				});
			}

			await writeAuditLog(
				db,
				tenantId,
				actor,
				'update',
				'user',
				`${existing.displayName}: ${existing.role} → ${nextRole}`
			);

			return toMembershipUser(
				{
					id: row.id,
					role: row.role,
					createdAt: row.createdAt,
					email: existing.email,
					displayName: existing.displayName
				},
				tenantId
			);
		});
	}

	private async findMemberRow(
		db: TenantDb,
		tenantId: string,
		memberId: string
	): Promise<MemberWithUserId> {
		const [row] = await db
			.select({
				id: member.id,
				role: member.role,
				createdAt: member.createdAt,
				userId: member.userId,
				email: user.email,
				displayName: user.name
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(eq(member.id, memberId), eq(member.organizationId, tenantId)))
			.limit(1);

		if (!row) {
			throw new NotFoundException({
				error: { code: 'not_found', message: 'Member not found' }
			});
		}

		return row;
	}
}
