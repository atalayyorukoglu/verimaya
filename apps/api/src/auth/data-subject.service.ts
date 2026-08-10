import { ForbiddenException, Injectable } from '@nestjs/common';
import {
	userRoleSchema,
	type DataDeletionRequest,
	type DataExport,
	type UserRole
} from '@verimaya/shared';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { writeAuditLog, type AuditActor } from '../common/audit-helper';
import { toAuditLog } from '../common/mappers';
import { toIsoDateTime } from '../common/pagination';
import {
	auditLogs,
	dataDeletionRequests,
	member,
	session,
	tenants,
	user
} from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

const ANONYMIZED_DISPLAY_NAME = 'Anonymized User';

function anonymizedEmail(userId: string): string {
	return `anonymized-${userId.replace(/-/g, '')}@invalid.local`;
}

function toDeletionRequest(row: typeof dataDeletionRequests.$inferSelect): DataDeletionRequest {
	return {
		id: row.id,
		tenant_id: row.tenantId,
		subject_user_id: row.subjectUserId,
		status: row.status as DataDeletionRequest['status'],
		anonymized_at: row.anonymizedAt ? toIsoDateTime(row.anonymizedAt) : null,
		created_at: toIsoDateTime(row.createdAt)
	};
}

type MembershipRow = {
	userId: string;
	email: string;
	displayName: string;
	userCreatedAt: Date;
	membershipCreatedAt: Date;
	role: string;
};

/**
 * AUDIT-F09-07 — panel-user data subject (KVKK m.11) under `/v1/me/*`.
 * Subject is always the session user; never a contact/patient row.
 */
@Injectable()
export class DataSubjectService {
	constructor(private readonly tenantContext: TenantContextService) {}

	async exportData(tenantId: string, subjectUserId: string): Promise<DataExport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const membership = await this.requireMembership(db, tenantId, subjectUserId);
			const role = this.parseRole(membership.role);

			const [tenantRow] = await db
				.select({
					dataRetentionUntil: tenants.dataRetentionUntil
				})
				.from(tenants)
				.where(eq(tenants.id, tenantId))
				.limit(1);

			const actorLogs = await db
				.select()
				.from(auditLogs)
				.where(and(eq(auditLogs.tenantId, tenantId), eq(auditLogs.actorId, subjectUserId)))
				.orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
				.limit(100);

			const deletionRows = await db
				.select()
				.from(dataDeletionRequests)
				.where(
					and(
						eq(dataDeletionRequests.tenantId, tenantId),
						eq(dataDeletionRequests.subjectUserId, subjectUserId)
					)
				)
				.orderBy(desc(dataDeletionRequests.createdAt))
				.limit(50);

			return {
				exported_at: new Date().toISOString(),
				tenant_id: tenantId,
				data_retention_until: tenantRow?.dataRetentionUntil
					? toIsoDateTime(tenantRow.dataRetentionUntil)
					: null,
				subject: {
					id: membership.userId,
					email: membership.email,
					display_name: membership.displayName,
					role,
					created_at: membership.userCreatedAt.toISOString(),
					membership_created_at: membership.membershipCreatedAt.toISOString()
				},
				audit_logs_as_actor: actorLogs.map(toAuditLog),
				deletion_requests: deletionRows.map(toDeletionRequest)
			};
		});
	}

	/**
	 * Records a deletion request and anonymizes identifying fields on the user row
	 * when this is the subject's only organization membership. Hard-delete is never used.
	 * Financial / audit rows stay (actor_id preserved; display name may remain historical).
	 */
	async requestDeletion(
		tenantId: string,
		subjectUserId: string,
		actor: AuditActor
	): Promise<DataDeletionRequest> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await this.requireMembership(db, tenantId, subjectUserId);

			const [existingApplied] = await db
				.select()
				.from(dataDeletionRequests)
				.where(
					and(
						eq(dataDeletionRequests.tenantId, tenantId),
						eq(dataDeletionRequests.subjectUserId, subjectUserId),
						eq(dataDeletionRequests.status, 'applied')
					)
				)
				.orderBy(desc(dataDeletionRequests.createdAt))
				.limit(1);

			if (existingApplied) {
				return toDeletionRequest(existingApplied);
			}

			const [{ count }] = await db
				.select({ count: sql<number>`count(*)::int` })
				.from(member)
				.where(and(eq(member.userId, subjectUserId), ne(member.organizationId, tenantId)));

			const canAnonymizeGlobally = Number(count) === 0;
			const now = new Date();

			if (canAnonymizeGlobally) {
				await db
					.update(user)
					.set({
						name: ANONYMIZED_DISPLAY_NAME,
						email: anonymizedEmail(subjectUserId),
						image: null,
						emailVerified: false,
						twoFactorEnabled: false
					})
					.where(eq(user.id, subjectUserId));

				await db.delete(session).where(eq(session.userId, subjectUserId));
			}

			const [row] = await db
				.insert(dataDeletionRequests)
				.values({
					tenantId,
					subjectUserId,
					status: canAnonymizeGlobally ? 'applied' : 'received',
					anonymizedAt: canAnonymizeGlobally ? now : null
				})
				.returning();

			await writeAuditLog(
				db,
				tenantId,
				actor,
				'delete',
				'user',
				canAnonymizeGlobally
					? `data-deletion-request:${row!.id}:anonymized`
					: `data-deletion-request:${row!.id}:received-multi-org`
			);

			return toDeletionRequest(row!);
		});
	}

	private async requireMembership(
		db: TenantDb,
		tenantId: string,
		subjectUserId: string
	): Promise<MembershipRow> {
		const [membership] = await db
			.select({
				userId: user.id,
				email: user.email,
				displayName: user.name,
				userCreatedAt: user.createdAt,
				membershipCreatedAt: member.createdAt,
				role: member.role
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(eq(member.organizationId, tenantId), eq(member.userId, subjectUserId)))
			.limit(1);

		if (!membership) {
			throw new ForbiddenException({
				error: {
					code: 'organization_membership_required',
					message: 'Active organization membership is required'
				}
			});
		}

		return membership;
	}

	private parseRole(role: string): UserRole {
		const parsed = userRoleSchema.safeParse(role);
		if (!parsed.success) {
			throw new ForbiddenException({
				error: {
					code: 'organization_membership_required',
					message: 'Active organization membership is required'
				}
			});
		}
		return parsed.data;
	}
}
