import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { userRoleSchema, type Me, type UserRole } from "@verimaya/shared";
import { and, eq } from "drizzle-orm";
import { DbService } from "../db/db.service";
import { member, user } from "../db/schema";
import { isPlatformAdminEmail } from "../platform/platform-admin";

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
  constructor(private readonly db: DbService) {}

  async resolveMembershipUser(input: ResolveMembershipInput): Promise<Me> {
    const activeOrganizationId = this.requireActiveOrganization(input);
    const membership = await this.findMembership({
      ...input,
      activeOrganizationId,
    });
    const role = this.resolveRole(membership, input.requestId);
    const platform_admin = isPlatformAdminEmail(
      input.email ?? membership.email,
      process.env.PLATFORM_ADMIN_EMAILS,
    );

    return {
      id: membership.id,
      email: membership.email,
      display_name: membership.displayName,
      created_at: membership.createdAt.toISOString(),
      tenant_id: activeOrganizationId,
      role,
      platform_admin,
    };
  }

  async resolveOrganizationRole(
    input: ResolveMembershipInput,
  ): Promise<UserRole> {
    const activeOrganizationId = this.requireActiveOrganization(input);
    const membership = await this.findMembership({
      ...input,
      activeOrganizationId,
    });
    return this.resolveRole(membership, input.requestId);
  }

  private requireActiveOrganization({
    activeOrganizationId,
    requestId,
  }: ResolveMembershipInput): string {
    if (activeOrganizationId) return activeOrganizationId;

    throw new BadRequestException({
      error: {
        code: "active_organization_required",
        message: "Active organization is required",
      },
      request_id: requestId,
    });
  }

  private async findMembership({
    userId,
    activeOrganizationId,
    requestId,
  }: ResolveMembershipInput & {
    activeOrganizationId: string;
  }): Promise<MembershipRow> {
    const [membership] = await this.db.client
      .select({
        id: user.id,
        email: user.email,
        displayName: user.name,
        createdAt: user.createdAt,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(
          eq(member.organizationId, activeOrganizationId),
          eq(member.userId, userId),
        ),
      )
      .limit(1);

    if (!membership) {
      throw new ForbiddenException({
        error: {
          code: "organization_membership_required",
          message: "Active organization membership is required",
        },
        request_id: requestId,
      });
    }

    return membership;
  }

  private resolveRole(membership: MembershipRow, requestId: string): UserRole {
    const role = userRoleSchema.safeParse(membership.role);
    if (role.success) return role.data;

    throw new ForbiddenException({
      error: {
        code: "organization_membership_required",
        message: "Active organization membership is required",
      },
      request_id: requestId,
    });
  }
}
