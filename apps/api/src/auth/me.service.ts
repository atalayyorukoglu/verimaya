import {
	BadRequestException,
	ForbiddenException,
	Injectable
} from '@nestjs/common';
import {
	emptyUserUiPreferences,
	filterKnownProductModuleIds,
	userRoleSchema,
	type Me,
	type UserRole,
	type UserUiPreferences,
	type UserUiPreferencesUpdate
} from '@verimaya/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { member, organization, tenants, user, userUiPreferences } from '../db/schema';
import { isPlatformAdminEmail } from '../platform/platform-admin';
import { TenantContextService } from '../tenant/tenant-context.service';

export type ResolveMembershipInput = {
	userId: string;
	activeOrganizationId: string | null | undefined;
	requestId: string;
	email?: string | null;
};

type MembershipRow = {
	id: string;
	email: string;
	displayName: string;
	createdAt: Date;
	role: string;
};

@Injectable()
export class MeService {
	constructor(
		private readonly db: DbService,
		private readonly tenantContext: TenantContextService
	) {}

	async resolveMembershipUser(input: ResolveMembershipInput): Promise<Me> {
		const activeOrganizationId = this.requireActiveOrganization(input);
		const membership = await this.findMembership({
			...input,
			activeOrganizationId
		});
		const role = this.resolveRole(membership, input.requestId);
		const platform_admin = isPlatformAdminEmail(
			input.email ?? membership.email,
			process.env.PLATFORM_ADMIN_EMAILS
		);
		const preferences = await this.getPreferences(input.userId, activeOrganizationId);

		return {
			id: membership.id,
			user_id: input.userId,
			email: membership.email,
			display_name: membership.displayName,
			created_at: membership.createdAt.toISOString(),
			tenant_id: activeOrganizationId,
			role,
			platform_admin,
			preferences
		};
	}

	/**
	 * Memberships of the session user whose tenant is still active.
	 * Intersects better-auth `organization` + `member` with `tenants.deleted_at IS NULL`
	 * so a soft-deleted org never appears in pickers or switchers.
	 * Not tenant-GUC scoped: the user is the subject (cross-org membership list).
	 */
	async listOrganizations(userId: string) {
		const rows = await this.db.client
			.select({
				id: organization.id,
				name: organization.name,
				slug: organization.slug
			})
			.from(member)
			.innerJoin(organization, eq(member.organizationId, organization.id))
			.innerJoin(tenants, eq(tenants.id, organization.id))
			.where(and(eq(member.userId, userId), isNull(tenants.deletedAt)))
			.orderBy(asc(organization.name));

		return { items: rows };
	}

	async resolveOrganizationRole(
		input: ResolveMembershipInput
	): Promise<UserRole> {
		const activeOrganizationId = this.requireActiveOrganization(input);
		const membership = await this.findMembership({
			...input,
			activeOrganizationId
		});
		return this.resolveRole(membership, input.requestId);
	}

	/**
	 * Full-replace upsert of the session user's UI preferences for the active org.
	 * Always scopes writes to `(userId, organizationId)` — never accepts client ids.
	 */
	async savePreferences(
		userId: string,
		organizationId: string,
		input: UserUiPreferencesUpdate
	): Promise<UserUiPreferences> {
		const enabled = filterKnownProductModuleIds(input.enabled_product_modules);
		const preferences: UserUiPreferences = { enabled_product_modules: enabled };

		await this.tenantContext.withTenant(organizationId, async ({ db }) => {
			await db
				.insert(userUiPreferences)
				.values({
					userId,
					organizationId,
					enabledProductModules: enabled
				})
				.onConflictDoUpdate({
					target: [userUiPreferences.userId, userUiPreferences.organizationId],
					set: {
						enabledProductModules: enabled,
						updatedAt: new Date()
					}
				});
		});

		return preferences;
	}

	async getPreferences(userId: string, organizationId: string): Promise<UserUiPreferences> {
		return this.tenantContext.withTenant(organizationId, async ({ db }) => {
			const [row] = await db
				.select({
					enabledProductModules: userUiPreferences.enabledProductModules
				})
				.from(userUiPreferences)
				.where(
					and(
						eq(userUiPreferences.userId, userId),
						eq(userUiPreferences.organizationId, organizationId)
					)
				)
				.limit(1);

			if (!row) return emptyUserUiPreferences();
			return {
				enabled_product_modules: filterKnownProductModuleIds(row.enabledProductModules ?? [])
			};
		});
	}

	private requireActiveOrganization({
		activeOrganizationId,
		requestId
	}: ResolveMembershipInput): string {
		if (activeOrganizationId) return activeOrganizationId;

		throw new BadRequestException({
			error: {
				code: 'active_organization_required',
				message: 'Active organization is required'
			},
			request_id: requestId
		});
	}

	private async findMembership({
		userId,
		activeOrganizationId,
		requestId
	}: ResolveMembershipInput & {
		activeOrganizationId: string;
	}): Promise<MembershipRow> {
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

		if (!membership) {
			throw new ForbiddenException({
				error: {
					code: 'organization_membership_required',
					message: 'Active organization membership is required'
				},
				request_id: requestId
			});
		}

		return membership;
	}

	private resolveRole(membership: MembershipRow, requestId: string): UserRole {
		const role = userRoleSchema.safeParse(membership.role);
		if (role.success) return role.data;

		throw new ForbiddenException({
			error: {
				code: 'organization_membership_required',
				message: 'Active organization membership is required'
			},
			request_id: requestId
		});
	}
}
