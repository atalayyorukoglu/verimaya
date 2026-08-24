import { randomUUID } from "node:crypto";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db/client";
import { DbService } from "../db/db.service";
import { jobs } from "../db/schema";
import { purgeTenantFixtures } from "../test/purge-tenant-fixtures";
import { TenantContextService } from "../tenant/tenant-context.service";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PlatformService } from "./platform.service";

const databaseUrl =
  process.env.DATABASE_URL_APP ??
  process.env.DATABASE_URL ??
  "postgresql://verimaya_app:verimaya@localhost:5433/verimaya";

function makeRequest(email: string | undefined): FastifyRequest {
  return {
    id: "req-1",
    authSession: email ? { user: { email } } : undefined,
  } as unknown as FastifyRequest;
}

function makeContext(req: FastifyRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
    }),
    getHandler: () => () => undefined,
    getClass: () => PlatformAdminGuard,
  } as unknown as ExecutionContext;
}

describe("PlatformAdminGuard — llm-usage'ı da korur (test 1)", () => {
  const originalEnv = process.env.PLATFORM_ADMIN_EMAILS;

  afterAll(() => {
    process.env.PLATFORM_ADMIN_EMAILS = originalEnv;
  });

  it("platform admin olmayan kullanıcı 403 alır", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@verimaya.test";
    const guard = new PlatformAdminGuard();
    const ctx = makeContext(makeRequest("agent@example.com"));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("oturumsuz istek de 403 alır", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@verimaya.test";
    const guard = new PlatformAdminGuard();
    const ctx = makeContext(makeRequest(undefined));
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it("allowlist'teki platform admin geçer", () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@verimaya.test";
    const guard = new PlatformAdminGuard();
    const ctx = makeContext(makeRequest("admin@verimaya.test"));
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

describe("PlatformService.llmUsage — jobs.job_type='llm.parse' agregasyonu", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let service: PlatformService;
  let tenantContext: TenantContextService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { db, sql } = getDb(databaseUrl);

    for (const [id, label] of [
      [tenantA, "llma"],
      [tenantB, "llmb"],
    ] as const) {
      await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${`LlmUsage ${label}`}, ${`${label}-${id.slice(0, 8)}`}, now())
			`;
      await sql`
				insert into tenants (id, name, slug)
				values (${id}, ${`LlmUsage ${label}`}, ${`${label}-${id.slice(0, 8)}`})
			`;
    }

    const dbService = { client: db, sql } as unknown as DbService;
    tenantContext = new TenantContextService(dbService);
    service = new PlatformService(dbService, tenantContext);
  });

  afterAll(async () => {
    const { sql } = getDb(databaseUrl);
    await purgeTenantFixtures(sql, [tenantA, tenantB]);
    await closeDb();
  });

  async function insertJob(
    tenantId: string,
    payload: Record<string, unknown>,
    createdAt: Date = new Date(),
  ): Promise<void> {
    await tenantContext.withTenant(tenantId, async ({ db }) => {
      await db.insert(jobs).values({
        tenantId,
        queue: "default",
        jobType: "llm.parse",
        payload,
        status: "completed",
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
      });
    });
  }

  it("iki tenant'ın verisi ayrı ayrı toplanıyor, karışmıyor (test 2)", async () => {
    await insertJob(tenantA, {
      provider: "mistral",
      model: "mistral-medium-latest",
      requested_model: "mistral-medium-latest",
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      estimated_cost_usd_micros: 1000,
      path: "openai_compatible",
      error: null,
    });
    await insertJob(tenantA, {
      provider: "mistral",
      model: "mistral-medium-latest",
      requested_model: "mistral-medium-latest",
      prompt_tokens: 200,
      completion_tokens: 80,
      total_tokens: 280,
      estimated_cost_usd_micros: 2000,
      path: "openai_compatible",
      error: null,
    });
    await insertJob(tenantB, {
      provider: "mistral",
      model: "mistral-medium-latest",
      requested_model: "mistral-medium-latest",
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      estimated_cost_usd_micros: 100,
      path: "heuristic",
      error: null,
    });

    const result = await service.llmUsage({});
    const rowA = result.items.find((r) => r.tenant_id === tenantA);
    const rowB = result.items.find((r) => r.tenant_id === tenantB);

    expect(rowA?.call_count).toBe(2);
    expect(rowA?.total_tokens).toBe(430);
    expect(rowA?.estimated_cost_usd_micros).toBe(3000);
    expect(rowB?.call_count).toBe(1);
    expect(rowB?.total_tokens).toBe(15);
    expect(rowB?.estimated_cost_usd_micros).toBe(100);

    // Toplamlar en az bu iki tenant'ı kapsar (aynı test dosyasında paylaşılan DB — >=)
    expect(result.totals.call_count).toBeGreaterThanOrEqual(3);
    expect(result.totals.estimated_cost_usd_micros).toBeGreaterThanOrEqual(3100);
  });

  it("path_counts heuristic/openai_compatible/fallback'ı doğru sayıyor (test 3)", async () => {
    const tenantC = randomUUID();
    const { sql } = getDb(databaseUrl);
    await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantC}, 'LlmUsage paths', ${`paths-${tenantC.slice(0, 8)}`}, now())
		`;
    await sql`
			insert into tenants (id, name, slug)
			values (${tenantC}, 'LlmUsage paths', ${`paths-${tenantC.slice(0, 8)}`})
		`;

    try {
      await insertJob(tenantC, {
        provider: "mistral",
        model: "mistral-medium-latest",
        path: "heuristic",
        total_tokens: 10,
        estimated_cost_usd_micros: 0,
        error: null,
      });
      await insertJob(tenantC, {
        provider: "mistral",
        model: "mistral-medium-latest",
        path: "openai_compatible",
        total_tokens: 20,
        estimated_cost_usd_micros: 500,
        error: null,
      });
      await insertJob(tenantC, {
        provider: "mistral",
        model: "mistral-medium-latest",
        path: "openai_compatible_fallback",
        total_tokens: 5,
        estimated_cost_usd_micros: 0,
        error: "empty_response",
      });
      await insertJob(tenantC, {
        provider: "mistral",
        model: "mistral-medium-latest",
        path: "openai_compatible_fallback",
        total_tokens: 5,
        estimated_cost_usd_micros: 0,
        error: "timeout",
      });

      const result = await service.llmUsage({});
      const row = result.items.find((r) => r.tenant_id === tenantC);
      expect(row?.path_counts).toEqual({
        heuristic: 1,
        openai_compatible: 1,
        openai_compatible_fallback: 2,
      });
      expect(row?.error_count).toBe(2);
      expect(row?.models).toEqual(["mistral-medium-latest"]);
    } finally {
      await purgeTenantFixtures(sql, [tenantC]);
    }
  });

  it("eksik/null payload alanı olan eski satır patlatmıyor (test 4)", async () => {
    const tenantD = randomUUID();
    const { sql } = getDb(databaseUrl);
    await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantD}, 'LlmUsage legacy', ${`legacy-${tenantD.slice(0, 8)}`}, now())
		`;
    await sql`
			insert into tenants (id, name, slug)
			values (${tenantD}, 'LlmUsage legacy', ${`legacy-${tenantD.slice(0, 8)}`})
		`;

    try {
      // Eski satır: total_tokens / estimated_cost_usd_micros / path / model / error yok.
      await insertJob(tenantD, { provider: "mistral" });

      const result = await service.llmUsage({});
      const row = result.items.find((r) => r.tenant_id === tenantD);
      expect(row?.call_count).toBe(1);
      expect(row?.total_tokens).toBe(0);
      expect(row?.estimated_cost_usd_micros).toBe(0);
      expect(row?.path_counts).toEqual({
        heuristic: 0,
        openai_compatible: 0,
        openai_compatible_fallback: 0,
      });
      expect(row?.error_count).toBe(0);
      expect(row?.models).toEqual([]);
    } finally {
      await purgeTenantFixtures(sql, [tenantD]);
    }
  });

  it("boş dönemde boş sonuç döner, hata değil (test 5)", async () => {
    const result = await service.llmUsage({
      from: "2000-01-01",
      to: "2000-01-02",
    });
    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({
      call_count: 0,
      total_tokens: 0,
      estimated_cost_usd_micros: 0,
      error_count: 0,
      path_counts: {
        heuristic: 0,
        openai_compatible: 0,
        openai_compatible_fallback: 0,
      },
    });
  });
});
