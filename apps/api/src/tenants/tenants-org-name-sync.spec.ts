import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { MeService } from '../auth/me.service';
import { TenantsService } from './tenants.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Tenant rename must keep `tenants.name` and better-auth `organization.name` aligned,
 * and `/v1/me/organizations` must surface the domain (`tenants`) name.
 *
 * Tenant-scoped writes use drizzle transaction + SET LOCAL (is_local=true).
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

type OrgNameRow = { name: string; slug: string };

async function readOrganization(tenantId: string): Promise<OrgNameRow> {
	const { sql } = getDb(databaseUrl);
	const [row] = await sql`
		select name, slug from organization where id = ${tenantId}
	`;
	if (!row) throw new Error(`organization row missing: ${tenantId}`);
	return row as OrgNameRow;
}

async function readTenantName(tenantId: string): Promise<string> {
	const { sql } = getDb(databaseUrl);
	const [row] = await sql`select name from tenants where id = ${tenantId}`;
	if (!row) throw new Error(`tenant row missing: ${tenantId}`);
	return (row as { name: string }).name;
}

describe('tenant rename ↔ organization.name sync', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const userA = randomUUID();
	const slugA = `sync-a-${tenantA.slice(0, 8)}`;
	const slugB = `sync-b-${tenantB.slice(0, 8)}`;
	let tenantsService: TenantsService;
	let meService: MeService;
	const actor = { actorId: null, actorDisplayName: 'Sync Actor' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Sync Clinic A', ${slugA}, now()),
				(${tenantB}, 'Sync Agency B', ${slugB}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Sync Clinic A', ${slugA}),
				(${tenantB}, 'Sync Agency B', ${slugB})
		`;
		await sql`
			insert into "user" (id, name, email)
			values (${userA}, 'Sync User A', ${`sync-a-${userA.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${userA}, 'owner', now()),
				(${tenantB}, ${userA}, 'owner', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		tenantsService = new TenantsService(tenantContext);
		meService = new MeService(dbService, tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id = ${userA}`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('PATCH rename updates tenants + organization and /v1/me/organizations returns the new name', async () => {
		const beforeBOrg = await readOrganization(tenantB);
		const beforeBTenant = await readTenantName(tenantB);

		const updated = await tenantsService.update(tenantA, { name: 'Renamed Sync Clinic' }, actor);
		expect(updated.name).toBe('Renamed Sync Clinic');
		expect(updated.slug).toBe(slugA);

		const tenantName = await readTenantName(tenantA);
		const orgRow = await readOrganization(tenantA);
		expect(tenantName).toBe('Renamed Sync Clinic');
		expect(orgRow.name).toBe('Renamed Sync Clinic');
		expect(orgRow.slug).toBe(slugA);
		expect(orgRow.name).toBe(tenantName);

		const listed = await withTenantSession(tenantA, () => meService.listOrganizations(userA));
		const itemA = listed.items.find((o) => o.id === tenantA);
		expect(itemA).toBeDefined();
		expect(itemA!.name).toBe('Renamed Sync Clinic');
		expect(itemA!.slug).toBe(slugA);
		expect(itemA!.name).toBe(orgRow.name);
		expect(itemA!.name).toBe(tenantName);

		// Negative isolation: Tenant B name/organization untouched
		expect(await readTenantName(tenantB)).toBe(beforeBTenant);
		expect(await readOrganization(tenantB)).toEqual(beforeBOrg);
		expect(beforeBOrg.name).toBe('Sync Agency B');
		expect(beforeBOrg.slug).toBe(slugB);

		const itemB = listed.items.find((o) => o.id === tenantB);
		expect(itemB).toBeDefined();
		expect(itemB!.name).toBe('Sync Agency B');
	});

	it('listOrganizations prefers tenants.name when organization.name has drifted', async () => {
		const { sql } = getDb(databaseUrl);
		// Simulate historical drift: better-auth row stale, domain row current
		await sql`
			update organization set name = 'Stale Auth Name' where id = ${tenantA}
		`;
		await sql`
			update tenants set name = 'Domain Canonical Name' where id = ${tenantA}
		`;

		const listed = await withTenantSession(tenantA, () => meService.listOrganizations(userA));
		const itemA = listed.items.find((o) => o.id === tenantA);
		expect(itemA!.name).toBe('Domain Canonical Name');

		const orgRow = await readOrganization(tenantA);
		expect(orgRow.name).toBe('Stale Auth Name');

		// Heal via PATCH rename path
		await tenantsService.update(tenantA, { name: 'Healed Name' }, actor);
		expect(await readTenantName(tenantA)).toBe('Healed Name');
		expect((await readOrganization(tenantA)).name).toBe('Healed Name');

		const after = await withTenantSession(tenantA, () => meService.listOrganizations(userA));
		expect(after.items.find((o) => o.id === tenantA)!.name).toBe('Healed Name');
	});
});
