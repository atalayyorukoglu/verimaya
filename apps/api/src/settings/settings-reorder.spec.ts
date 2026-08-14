import { sql as drizzleSql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { settingsReorderSchema } from "@verimaya/shared";
import { closeDb, getDb } from "../db/client";
import {
  TenantContextService,
  type TenantDb,
} from "../tenant/tenant-context.service";
import type { CryptoService } from "../common/crypto.service";
import { SettingsService } from "./settings.service";
import { purgeTenantFixtures } from "../test/purge-tenant-fixtures";

/**
 * GAP-27: bulk absolute-set reorder for contact_types / appointment_types /
 * finance_categories. Same skip-foreign + real `updated` count pattern as bulk-type.
 */

const databaseUrl =
  process.env.DATABASE_URL_APP ??
  process.env.DATABASE_URL ??
  "postgresql://verimaya_app:verimaya@localhost:5433/verimaya";

describe("GAP-27 settings bulk reorder", () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let typeA1: string;
  let typeA2: string;
  let typeB: string;
  let apptA1: string;
  let apptA2: string;
  let catA1: string;
  let catA2: string;
  let catA3: string;
  let service: SettingsService;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    const { db, sql } = getDb(databaseUrl);

    const tenantContext = {
      withTenant: async <T>(
        id: string,
        fn: (ctx: { db: TenantDb }) => Promise<T>,
      ) =>
        db.transaction(async (tx) => {
          await tx.execute(
            drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`,
          );
          return fn({ db: tx as TenantDb });
        }),
    } as TenantContextService;

    service = new SettingsService(tenantContext, {} as CryptoService);

    await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Reorder A', ${`reorder-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Reorder B', ${`reorder-b-${tenantB.slice(0, 8)}`}, now())
		`;
    await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Reorder A', ${`reorder-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Reorder B', ${`reorder-b-${tenantB.slice(0, 8)}`})
		`;

    await sql.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
      const [a1] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Type A1', 0) returning id
			`;
      const [a2] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Type A2', 1) returning id
			`;
      typeA1 = a1!.id as string;
      typeA2 = a2!.id as string;
      const [p1] = await tx`
				insert into appointment_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Appt A1', 0) returning id
			`;
      const [p2] = await tx`
				insert into appointment_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Appt A2', 1) returning id
			`;
      apptA1 = p1!.id as string;
      apptA2 = p2!.id as string;
      const [c1] = await tx`
				insert into finance_categories (tenant_id, kind, name, sort_order, subcategories)
				values (${tenantA}, 'income', 'Cat A1', 0, '[]'::jsonb) returning id
			`;
      const [c2] = await tx`
				insert into finance_categories (tenant_id, kind, name, sort_order, subcategories)
				values (${tenantA}, 'expense', 'Cat A2', 1, '[]'::jsonb) returning id
			`;
      const [c3] = await tx`
				insert into finance_categories (tenant_id, kind, name, sort_order, subcategories)
				values (${tenantA}, 'income', 'Cat A3', 2, '[]'::jsonb) returning id
			`;
      catA1 = c1!.id as string;
      catA2 = c2!.id as string;
      catA3 = c3!.id as string;
    });

    await sql.begin(async (tx) => {
      await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
      const [b] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Type B', 0) returning id
			`;
      typeB = b!.id as string;
    });
  });

  afterAll(async () => {
    const { sql } = getDb(databaseUrl);
    await purgeTenantFixtures(sql, [tenantA, tenantB]);
    await closeDb();
  });

  it("reorders contact types atomically and returns the real updated count", async () => {
    const result = await service.reorderContactTypes(tenantA, {
      items: [
        { id: typeA1, sort_order: 5 },
        { id: typeA2, sort_order: 3 },
      ],
    });
    expect(result.updated).toBe(2);

    const list = await service.listContactTypes(tenantA);
    const byId = Object.fromEntries(
      list.items.map((i) => [i.id, i.sort_order]),
    );
    expect(byId[typeA1]).toBe(5);
    expect(byId[typeA2]).toBe(3);
  });

  it("skips foreign-tenant ids in the updated count (negative isolation)", async () => {
    const result = await service.reorderContactTypes(tenantA, {
      items: [
        { id: typeA1, sort_order: 0 },
        { id: typeB, sort_order: 99 },
        { id: randomUUID(), sort_order: 100 },
      ],
    });
    expect(result.updated).toBe(1);

    const listB = await service.listContactTypes(tenantB);
    expect(listB.items.find((i) => i.id === typeB)?.sort_order).toBe(0);
  });

  it("reorders appointment types and finance categories the same way", async () => {
    const appt = await service.reorderAppointmentTypes(tenantA, {
      items: [
        { id: apptA1, sort_order: 2 },
        { id: apptA2, sort_order: 1 },
      ],
    });
    expect(appt.updated).toBe(2);

    const cats = await service.reorderFinanceCategories(tenantA, {
      items: [
        { id: catA1, sort_order: 1 },
        { id: catA3, sort_order: 0 },
      ],
    });
    expect(cats.updated).toBe(2);

    const apptList = await service.listAppointmentTypes(tenantA);
    expect(apptList.items.find((i) => i.id === apptA1)?.sort_order).toBe(2);
    const catList = await service.listFinanceCategories(tenantA);
    expect(catList.items.find((i) => i.id === catA1)?.sort_order).toBe(1);
    expect(catList.items.find((i) => i.id === catA3)?.sort_order).toBe(0);
    expect(catList.items.find((i) => i.id === catA2)?.sort_order).toBe(1);
  });

  it("preserves the submitted subcategory array order", async () => {
    const subcategories = ["Zeta", "Alfa", "Orta"];
    const updated = await service.updateFinanceCategory(tenantA, catA1, {
      subcategories,
    });

    expect(updated.subcategories).toEqual(subcategories);
    const list = await service.listFinanceCategories(tenantA);
    expect(list.items.find((item) => item.id === catA1)?.subcategories).toEqual(
      subcategories,
    );
  });

  it("rejects duplicate ids via strict shared schema", () => {
    expect(
      settingsReorderSchema.safeParse({
        items: [
          { id: typeA1, sort_order: 0 },
          { id: typeA1, sort_order: 1 },
        ],
      }).success,
    ).toBe(false);
  });
});
