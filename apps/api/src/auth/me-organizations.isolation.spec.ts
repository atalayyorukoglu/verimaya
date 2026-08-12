import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { MeService } from './me.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * GET /v1/me/organizations — user-scoped membership list minus soft-deleted tenants.
 * Isolation is by user_id (not tenant GUC): User A must not see User B's orgs.
 * Soft-deleted tenants stay in `organization` but must not appear.
 *
 * Tenant-scoped fixture writes use drizzle transaction + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

describe('GET /v1/me/organizations isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const tenantDeleted = randomUUID();
	const userA = randomUUID();
	const userB = randomUUID();
	let service: MeService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Live Org A', ${`meorg-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Live Org B', ${`meorg-b-${tenantB.slice(0, 8)}`}, now()),
				(${tenantDeleted}, 'Deleted Org', ${`meorg-d-${tenantDeleted.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Live Org A', ${`meorg-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Live Org B', ${`meorg-b-${tenantB.slice(0, 8)}`}),
				(${tenantDeleted}, 'Deleted Org', ${`meorg-d-${tenantDeleted.slice(0, 8)}`})
		`;
		await sql`
			update tenants set deleted_at = now() where id = ${tenantDeleted}
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${userA}, 'Org List A', ${`meorg-a-${userA.slice(0, 8)}@example.com`}),
				(${userB}, 'Org List B', ${`meorg-b-${userB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${userA}, 'owner', now()),
				(${tenantDeleted}, ${userA}, 'owner', now()),
				(${tenantB}, ${userB}, 'owner', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		service = new MeService(dbService, new TenantContextService(dbService));
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB}, ${tenantDeleted})`;
		await sql`delete from "user" where id in (${userA}, ${userB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB, tenantDeleted]);
		await closeDb();
	});

	it('User A sees only own live org — not Tenant B and not the soft-deleted membership', async () => {
		const listed = await withTenantSession(tenantA, () => service.listOrganizations(userA));
		expect(listed.items.map((o) => o.id)).toEqual([tenantA]);
		expect(listed.items.some((o) => o.id === tenantB)).toBe(false);
		expect(listed.items.some((o) => o.id === tenantDeleted)).toBe(false);
	});

	it('User B does not see Tenant A (negative isolation)', async () => {
		const listed = await withTenantSession(tenantB, () => service.listOrganizations(userB));
		expect(listed.items.map((o) => o.id)).toEqual([tenantB]);
		expect(listed.items.some((o) => o.id === tenantA)).toBe(false);
		expect(listed.items.some((o) => o.id === tenantDeleted)).toBe(false);
	});
});
