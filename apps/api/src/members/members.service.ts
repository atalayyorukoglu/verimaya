import { randomUUID } from 'node:crypto';
import {
	BadRequestException,
	ForbiddenException,
	Injectable,
	NotFoundException
} from '@nestjs/common';
import { hashPassword } from 'better-auth/crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import type {
	MemberCreate,
	MemberUpdate,
	MembershipUser,
	SoftDeleteResult,
	UserRole
} from '@verimaya/shared';
import { account, member, user } from '../db/schema';
import { type AuditActor, writeAuditLog } from '../common/audit-helper';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';

export type MemberPasswordResetSender = (input: {
	email: string;
	redirectTo: string;
}) => Promise<void>;

function passwordResetRedirectTo(): string {
	const origins = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const appOrigin =
		origins.find((origin) => {
			try {
				const host = new URL(origin).hostname;
				return host === 'app.localhost' || host.startsWith('app.');
			} catch {
				return false;
			}
		}) ??
		origins[0] ??
		'http://localhost:5173';
	return `${appOrigin.replace(/\/$/, '')}/reset-password`;
}

async function sendBetterAuthPasswordReset(input: {
	email: string;
	redirectTo: string;
}): Promise<void> {
	const { getAuth } = await import('../auth/auth');
	await getAuth().api.requestPasswordReset({
		body: {
			email: input.email,
			redirectTo: input.redirectTo
		}
	});
}

type MemberRow = {
	id: string;
	role: string;
	createdAt: Date;
	email: string;
	displayName: string;
};

type MemberWithUserId = MemberRow & { userId: string };

function toMembershipUser(
	row: MemberRow & { userId: string },
	tenantId: string
): MembershipUser {
	return {
		id: row.id,
		user_id: row.userId,
		tenant_id: tenantId,
		email: row.email,
		display_name: row.displayName,
		role: row.role as UserRole,
		created_at: row.createdAt.toISOString()
	};
}

@Injectable()
export class MembersService {
	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly db: DbService
	) {}

	private passwordResetSender: MemberPasswordResetSender = sendBetterAuthPasswordReset;

	/** Test-only: skip better-auth / outbound mail. */
	usePasswordResetSender(sender: MemberPasswordResetSender): this {
		this.passwordResetSender = sender;
		return this;
	}

	/**
	 * `member` + `user` have no RLS. Join on the session client (same pattern as
	 * MeService.findMembership) — a tenant transaction can drop aliased `user`
	 * columns so the panel showed empty name/email.
	 */
	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		const cursorCond = createdAtCursorCondition(member.createdAt, member.id, params.cursor);
		const filters = [eq(member.organizationId, tenantId)];
		if (cursorCond) filters.push(cursorCond);

		const rows = await this.db.client
			.select({
				id: member.id,
				userId: member.userId,
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
	}

	/**
	 * Add a member to the active tenant. Mirrors platform `upsertMember` for
	 * user/account/member creation; scoped to the session tenant.
	 */
	async create(
		tenantId: string,
		input: MemberCreate,
		actor: AuditActor
	): Promise<MembershipUser> {
		const email = input.email.trim().toLowerCase();
		const displayName = input.display_name.trim();
		const role = input.role;
		const now = new Date();

		const [existingUser] = await this.db.client
			.select()
			.from(user)
			.where(eq(user.email, email))
			.limit(1);

		let userId: string;
		if (existingUser) {
			userId = existingUser.id;
			await this.db.client
				.update(user)
				.set({ name: displayName, updatedAt: now })
				.where(eq(user.id, userId));
			const passwordHash = await hashPassword(input.password);
			const [cred] = await this.db.client
				.select({ id: account.id })
				.from(account)
				.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
				.limit(1);
			if (cred) {
				await this.db.client
					.update(account)
					.set({ password: passwordHash, updatedAt: now })
					.where(eq(account.id, cred.id));
			} else {
				await this.db.client.insert(account).values({
					id: randomUUID(),
					accountId: userId,
					providerId: 'credential',
					userId,
					password: passwordHash,
					createdAt: now,
					updatedAt: now
				});
			}
		} else {
			userId = randomUUID();
			const passwordHash = await hashPassword(input.password);
			await this.db.client.insert(user).values({
				id: userId,
				name: displayName,
				email,
				emailVerified: true,
				createdAt: now,
				updatedAt: now
			});
			await this.db.client.insert(account).values({
				id: randomUUID(),
				accountId: userId,
				providerId: 'credential',
				userId,
				password: passwordHash,
				createdAt: now,
				updatedAt: now
			});
		}

		const [existingMember] = await this.db.client
			.select()
			.from(member)
			.where(and(eq(member.organizationId, tenantId), eq(member.userId, userId)))
			.limit(1);

		let memberId: string;
		let memberCreatedAt: Date;
		if (existingMember) {
			memberId = existingMember.id;
			memberCreatedAt = existingMember.createdAt;
			await this.db.client
				.update(member)
				.set({ role })
				.where(eq(member.id, existingMember.id));
		} else {
			memberId = randomUUID();
			memberCreatedAt = now;
			await this.db.client.insert(member).values({
				id: memberId,
				organizationId: tenantId,
				userId,
				role,
				createdAt: now
			});
		}

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await writeAuditLog(db, tenantId, actor, 'create', 'user', email);
		});

		return toMembershipUser(
			{
				id: memberId,
				userId,
				role,
				createdAt: memberCreatedAt,
				email,
				displayName
			},
			tenantId
		);
	}

	async update(
		tenantId: string,
		memberId: string,
		input: MemberUpdate,
		actor: AuditActor
	): Promise<MembershipUser> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const existing = await this.findMemberRow(tenantId, memberId);

			if (actor.actorId && existing.userId === actor.actorId) {
				if (input.password !== undefined) {
					throw new ForbiddenException({
						error: {
							code: 'cannot_change_own_password',
							message: 'Use change-password for your own password'
						}
					});
				}
				throw new ForbiddenException({
					error: {
						code: 'cannot_change_own_role',
						message: 'You cannot change your own role'
					}
				});
			}

			let nextRole = existing.role as UserRole;
			if (input.role !== undefined) {
				nextRole = input.role;
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

				if (existing.role !== nextRole) {
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
				}
			}

			if (input.password !== undefined) {
				const passwordHash = await hashPassword(input.password);
				const now = new Date();
				const [cred] = await this.db.client
					.select({ id: account.id })
					.from(account)
					.where(
						and(eq(account.userId, existing.userId), eq(account.providerId, 'credential'))
					)
					.limit(1);
				if (cred) {
					await this.db.client
						.update(account)
						.set({ password: passwordHash, updatedAt: now })
						.where(eq(account.id, cred.id));
				} else {
					await this.db.client.insert(account).values({
						id: randomUUID(),
						accountId: existing.userId,
						providerId: 'credential',
						userId: existing.userId,
						password: passwordHash,
						createdAt: now,
						updatedAt: now
					});
				}

				await writeAuditLog(
					db,
					tenantId,
					actor,
					'update',
					'user',
					`${existing.displayName}: password set`
				);
			}

			return toMembershipUser(
				{
					id: existing.id,
					userId: existing.userId,
					role: nextRole,
					createdAt: existing.createdAt,
					email: existing.email,
					displayName: existing.displayName
				},
				tenantId
			);
		});
	}

	async remove(
		tenantId: string,
		memberId: string,
		actor: AuditActor
	): Promise<SoftDeleteResult> {
		const existing = await this.findMemberRow(tenantId, memberId);

		if (actor.actorId && existing.userId === actor.actorId) {
			throw new BadRequestException({
				error: {
					code: 'cannot_remove_self',
					message: 'You cannot remove your own membership'
				}
			});
		}

		if (existing.role === 'owner') {
			const [{ value: ownerCount }] = await this.db.client
				.select({ value: count() })
				.from(member)
				.where(and(eq(member.organizationId, tenantId), eq(member.role, 'owner')));

			if (Number(ownerCount) <= 1) {
				throw new BadRequestException({
					error: {
						code: 'last_owner',
						message: 'Cannot remove the last owner'
					}
				});
			}
		}

		await this.db.client
			.delete(member)
			.where(and(eq(member.id, memberId), eq(member.organizationId, tenantId)));

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await writeAuditLog(db, tenantId, actor, 'delete', 'user', existing.email);
		});

		return { id: memberId, deleted: true };
	}

	/**
	 * Admin/owner sends better-auth's existing reset email — never sets a password.
	 * Soft-deleted orgs are already unreachable (ActiveOrg + live tenant).
	 */
	async sendPasswordResetEmail(
		tenantId: string,
		memberId: string,
		actor: AuditActor
	): Promise<{ sent: true }> {
		const existing = await this.findMemberRow(tenantId, memberId);

		if (actor.actorId && existing.userId === actor.actorId) {
			throw new ForbiddenException({
				error: {
					code: 'cannot_reset_own_password',
					message: 'Use change-password for your own password'
				}
			});
		}

		await this.passwordResetSender({
			email: existing.email,
			redirectTo: passwordResetRedirectTo()
		});

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			await writeAuditLog(
				db,
				tenantId,
				actor,
				'update',
				'user',
				`${existing.displayName}: password reset email`
			);
		});

		return { sent: true };
	}

	private async findMemberRow(
		tenantId: string,
		memberId: string
	): Promise<MemberWithUserId> {
		const [row] = await this.db.client
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
