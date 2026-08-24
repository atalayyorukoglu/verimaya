import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { hashPassword } from "better-auth/crypto";
import {
  addCalendarDays,
  utcTodayIsoDate,
  type MembershipUser,
  type PlatformLlmUsagePathCounts,
  type PlatformLlmUsageResponse,
  type PlatformLlmUsageTenantRow,
  type PlatformMemberUpsert,
  type PlatformTenant,
  type PlatformTenantCreate,
  type PlatformTenantUpdate,
  type ReportPeriodParams,
  type SoftDeleteResult,
} from "@verimaya/shared";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { writeAuditLog, type AuditActor } from "../common/audit-helper";
import { toTenant } from "../common/mappers";
import { DbService } from "../db/db.service";
import {
  account,
  jobs,
  member,
  organization,
  tenants,
  user,
} from "../db/schema";
import { LLM_PARSE_JOB_TYPE } from "../integrations/llm";
import { TenantContextService } from "../tenant/tenant-context.service";

function slugifyName(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";
  return base;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly db: DbService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async listTenants(): Promise<{ items: PlatformTenant[] }> {
    const rows = await this.db.client
      .select()
      .from(tenants)
      .orderBy(asc(tenants.createdAt));
    const items: PlatformTenant[] = rows.map((row) =>
      this.toPlatformTenant(row, false),
    );
    // Lock flag is expensive cross-tenant; platform UI doesn't edit base_currency.
    return { items };
  }

  /**
   * Tenant başına LLM maliyeti (`jobs.job_type = 'llm.parse'`).
   *
   * `jobs` üzerinde RLS var (FORCE ROW LEVEL SECURITY, `tenant_id = app.current_tenant_id()`).
   * Tek sorguda tüm tenant'ları okuyacak bir bypass yok — `verimaya_app` rolü NOBYPASSRLS
   * (bkz. tenant-context.service.ts). Bunun yerine `OutboxAdminService.listDead`/`requeue`
   * ile aynı deseni kullanıyoruz: tenant id listesini RLS'siz `tenants` tablosundan al,
   * her tenant için `tenantContext.withTenant` ile ayrı bir SET LOCAL'lı sorgu çalıştır,
   * SQL'in tek tenant için ürettiği agregatları (COUNT/SUM/array_agg) TS'te birleştir.
   * Bu, ham job satırlarını çekip istemcide toplamaktan farklı — her sorgu zaten
   * kendi tenant'ı için tam agregasyonu SQL'de yapıyor.
   */
  async llmUsage(params: ReportPeriodParams): Promise<PlatformLlmUsageResponse> {
    const to = params.to ?? utcTodayIsoDate();
    const from = params.from ?? addCalendarDays(to, -29);
    const startUtc = new Date(`${from}T00:00:00.000Z`);
    const endExclusiveUtc = new Date(`${addCalendarDays(to, 1)}T00:00:00.000Z`);

    const tenantRows = await this.db.client
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .orderBy(asc(tenants.name));

    const items: PlatformLlmUsageTenantRow[] = [];
    for (const t of tenantRows) {
      const [row] = await this.tenantContext.withTenant(t.id, ({ db }) =>
        db
          .select({
            callCount: sql<number>`count(*)::int`,
            totalTokens: sql<number>`coalesce(sum((${jobs.payload}->>'total_tokens')::bigint), 0)`,
            costMicros: sql<number>`coalesce(sum((${jobs.payload}->>'estimated_cost_usd_micros')::bigint), 0)`,
            heuristicCount: sql<number>`count(*) filter (where ${jobs.payload}->>'path' = 'heuristic')::int`,
            openaiCompatibleCount: sql<number>`count(*) filter (where ${jobs.payload}->>'path' = 'openai_compatible')::int`,
            fallbackCount: sql<number>`count(*) filter (where ${jobs.payload}->>'path' = 'openai_compatible_fallback')::int`,
            errorCount: sql<number>`count(*) filter (where coalesce(${jobs.payload}->>'error', '') <> '')::int`,
            models: sql<
              string[]
            >`coalesce(array_agg(distinct ${jobs.payload}->>'model') filter (where ${jobs.payload}->>'model' is not null), '{}')`,
          })
          .from(jobs)
          .where(
            and(
              eq(jobs.jobType, LLM_PARSE_JOB_TYPE),
              eq(jobs.status, "completed"),
              gte(jobs.createdAt, startUtc),
              lt(jobs.createdAt, endExclusiveUtc),
            ),
          ),
      );

      const callCount = Number(row?.callCount ?? 0);
      if (callCount === 0) continue;

      items.push({
        tenant_id: t.id,
        tenant_name: t.name,
        call_count: callCount,
        total_tokens: Number(row?.totalTokens ?? 0),
        estimated_cost_usd_micros: Number(row?.costMicros ?? 0),
        path_counts: {
          heuristic: Number(row?.heuristicCount ?? 0),
          openai_compatible: Number(row?.openaiCompatibleCount ?? 0),
          openai_compatible_fallback: Number(row?.fallbackCount ?? 0),
        },
        error_count: Number(row?.errorCount ?? 0),
        models: (row?.models ?? []).filter(
          (m): m is string => m != null && m !== "",
        ),
      });
    }

    items.sort((a, b) => b.estimated_cost_usd_micros - a.estimated_cost_usd_micros);

    const totals = items.reduce<{
      call_count: number;
      total_tokens: number;
      estimated_cost_usd_micros: number;
      error_count: number;
      path_counts: PlatformLlmUsagePathCounts;
    }>(
      (acc, item) => {
        acc.call_count += item.call_count;
        acc.total_tokens += item.total_tokens;
        acc.estimated_cost_usd_micros += item.estimated_cost_usd_micros;
        acc.error_count += item.error_count;
        acc.path_counts.heuristic += item.path_counts.heuristic;
        acc.path_counts.openai_compatible += item.path_counts.openai_compatible;
        acc.path_counts.openai_compatible_fallback +=
          item.path_counts.openai_compatible_fallback;
        return acc;
      },
      {
        call_count: 0,
        total_tokens: 0,
        estimated_cost_usd_micros: 0,
        error_count: 0,
        path_counts: {
          heuristic: 0,
          openai_compatible: 0,
          openai_compatible_fallback: 0,
        },
      },
    );

    return { period: { from, to }, items, totals };
  }

  async createTenant(
    input: PlatformTenantCreate,
    actorUserId: string,
    actor: AuditActor,
  ): Promise<PlatformTenant> {
    const name = input.name.trim();
    const slug = await this.uniqueSlug(slugifyName(name));
    const id = randomUUID();
    const now = new Date();

    await this.db.client.insert(organization).values({
      id,
      name,
      slug,
      createdAt: now,
    });
    await this.db.client.insert(tenants).values({
      id,
      name,
      slug,
    });

    if (input.grant_self_admin) {
      await this.db.client.insert(member).values({
        id: randomUUID(),
        organizationId: id,
        userId: actorUserId,
        role: "owner",
        createdAt: now,
      });
    }

    await this.tenantContext.withTenant(id, async ({ db }) => {
      await writeAuditLog(db, id, actor, "create", "tenant", name);
    });

    const [row] = await this.db.client
      .select()
      .from(tenants)
      .where(eq(tenants.id, id))
      .limit(1);
    return this.toPlatformTenant(row!, false);
  }

  async updateTenant(
    tenantId: string,
    input: PlatformTenantUpdate,
    actor: AuditActor,
  ): Promise<PlatformTenant> {
    const existing = await this.requireTenantRow(tenantId);
    const name = input.name.trim();

    await this.db.client
      .update(organization)
      .set({ name })
      .where(eq(organization.id, tenantId));
    const [row] = await this.db.client
      .update(tenants)
      .set({ name })
      .where(eq(tenants.id, tenantId))
      .returning();

    await this.tenantContext.withTenant(tenantId, async ({ db }) => {
      await writeAuditLog(db, tenantId, actor, "update", "tenant", name);
    });

    return this.toPlatformTenant(row ?? { ...existing, name }, false);
  }

  async softDeleteTenant(
    tenantId: string,
    actor: AuditActor,
  ): Promise<{ id: string; deleted_at: string }> {
    const existing = await this.requireTenantRow(tenantId);
    if (existing.deletedAt) {
      return {
        id: tenantId,
        deleted_at: existing.deletedAt.toISOString(),
      };
    }

    const [row] = await this.db.client
      .update(tenants)
      .set({ deletedAt: new Date() })
      .where(eq(tenants.id, tenantId))
      .returning();

    const deletedAt = row?.deletedAt ?? new Date();

    await this.tenantContext.withTenant(tenantId, async ({ db }) => {
      await writeAuditLog(
        db,
        tenantId,
        actor,
        "delete",
        "tenant",
        existing.name,
      );
    });

    return { id: tenantId, deleted_at: deletedAt.toISOString() };
  }

  async listMembers(tenantId: string): Promise<{ items: MembershipUser[] }> {
    await this.requireTenantRow(tenantId);
    const rows = await this.db.client
      .select({
        id: user.id,
        email: user.email,
        displayName: user.name,
        createdAt: user.createdAt,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, tenantId))
      .orderBy(asc(user.email));

    return {
      items: rows.map((r) => ({
        id: r.id,
        user_id: r.id,
        email: r.email,
        display_name: r.displayName,
        created_at: r.createdAt.toISOString(),
        tenant_id: tenantId,
        role: r.role as MembershipUser["role"],
      })),
    };
  }

  async upsertMember(
    tenantId: string,
    input: PlatformMemberUpsert,
    actor: AuditActor,
  ): Promise<MembershipUser> {
    await this.requireTenantRow(tenantId);
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
        .where(
          and(eq(account.userId, userId), eq(account.providerId, "credential")),
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
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
          createdAt: now,
          updatedAt: now,
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
        updatedAt: now,
      });
      await this.db.client.insert(account).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [existingMember] = await this.db.client
      .select()
      .from(member)
      .where(
        and(eq(member.organizationId, tenantId), eq(member.userId, userId)),
      )
      .limit(1);

    if (existingMember) {
      await this.db.client
        .update(member)
        .set({ role })
        .where(eq(member.id, existingMember.id));
    } else {
      await this.db.client.insert(member).values({
        id: randomUUID(),
        organizationId: tenantId,
        userId,
        role,
        createdAt: now,
      });
    }

    await this.tenantContext.withTenant(tenantId, async ({ db }) => {
      await writeAuditLog(db, tenantId, actor, "update", "user", email);
    });

    const [u] = await this.db.client
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return {
      id: userId,
      user_id: userId,
      email: u!.email,
      display_name: u!.name,
      created_at: u!.createdAt.toISOString(),
      tenant_id: tenantId,
      role,
    };
  }

  async removeMember(
    tenantId: string,
    userId: string,
    actorUserId: string,
    actor: AuditActor,
  ): Promise<SoftDeleteResult> {
    await this.requireTenantRow(tenantId);
    if (userId === actorUserId) {
      throw new BadRequestException({
        error: {
          code: "cannot_remove_self",
          message: "You cannot remove your own membership from this panel",
        },
      });
    }

    const [row] = await this.db.client
      .select({ id: member.id, email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(
        and(eq(member.organizationId, tenantId), eq(member.userId, userId)),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Member not found" },
      });
    }

    await this.db.client.delete(member).where(eq(member.id, row.id));

    await this.tenantContext.withTenant(tenantId, async ({ db }) => {
      await writeAuditLog(db, tenantId, actor, "delete", "user", row.email);
    });

    return { id: userId, deleted: true };
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = base;
    let n = 2;
    for (;;) {
      const [hit] = await this.db.client
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, slug))
        .limit(1);
      if (!hit) return slug;
      slug = `${base.slice(0, 36)}-${n++}`;
      if (n > 1000) {
        throw new ConflictException({
          error: {
            code: "slug_exhausted",
            message: "Could not allocate a unique slug",
          },
        });
      }
    }
  }

  private async requireTenantRow(tenantId: string) {
    const [row] = await this.db.client
      .select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!row) {
      throw new NotFoundException({
        error: { code: "not_found", message: "Tenant not found" },
      });
    }
    return row;
  }

  private toPlatformTenant(
    row: typeof tenants.$inferSelect,
    locked: boolean,
  ): PlatformTenant {
    return {
      ...toTenant(row, locked),
      deleted_at: row.deletedAt ? row.deletedAt.toISOString() : null,
    };
  }
}
