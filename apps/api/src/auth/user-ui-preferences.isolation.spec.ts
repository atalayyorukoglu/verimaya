import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { userUiPreferences } from '../db/schema';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { MeService } from './me.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * User UI preferences: org RLS isolation + service-layer user_id scoping.
 * Tenant mock mirrors production: drizzle transaction + SET LOCAL (is_local=true).
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
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('user UI preferences isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const userA = randomUUID();
	const userB = randomUUID();
	const userBoth = randomUUID();
	let service: MeService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Prefs Tenant A', ${`pref-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Prefs Tenant B', ${`pref-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Prefs Tenant A', ${`pref-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Prefs Tenant B', ${`pref-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${userA}, 'Prefs User A', ${`pref-a-${userA.slice(0, 8)}@example.com`}),
				(${userB}, 'Prefs User B', ${`pref-b-${userB.slice(0, 8)}@example.com`}),
				(${userBoth}, 'Prefs User Multi', ${`pref-m-${userBoth.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${userA}, 'agent', now()),
				(${tenantB}, ${userB}, 'agent', now()),
				(${tenantA}, ${userBoth}, 'agent', now()),
				(${tenantB}, ${userBoth}, 'agent', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		service = new MeService(dbService, new TenantContextService(dbService));

		await service.savePreferences(userA, tenantA, {
			enabled_product_modules: ['campaign-assistant']
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${userA}, ${userB}, ${userBoth})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B cannot read Tenant A preference rows via RLS', async () => {
		const a = await service.getPreferences(userA, tenantA);
		expect(a.enabled_product_modules).toEqual(['campaign-assistant']);

		const cross = await withTenantSession(tenantB, async (tdb) => {
			return tdb
				.select()
				.from(userUiPreferences)
				.where(eq(userUiPreferences.organizationId, tenantA));
		});
		expect(cross).toEqual([]);
	});

	it('another user in the same org does not receive peer preferences', async () => {
		const peer = await service.getPreferences(userBoth, tenantA);
		expect(peer.enabled_product_modules).toEqual([
			'untouched-contacts',
			'referral-value'
		]);

		await service.savePreferences(userBoth, tenantA, {
			enabled_product_modules: []
		});
		const stillA = await service.getPreferences(userA, tenantA);
		expect(stillA.enabled_product_modules).toEqual(['campaign-assistant']);
	});

	it('same user keeps separate prefs per organization', async () => {
		await service.savePreferences(userBoth, tenantA, {
			enabled_product_modules: ['campaign-assistant']
		});
		await service.savePreferences(userBoth, tenantB, {
			enabled_product_modules: []
		});

		await expect(service.getPreferences(userBoth, tenantA)).resolves.toEqual({
			enabled_product_modules: ['campaign-assistant']
		});
		await expect(service.getPreferences(userBoth, tenantB)).resolves.toEqual({
			enabled_product_modules: []
		});
	});

	it('Tenant B save stays isolated from Tenant A', async () => {
		await service.savePreferences(userB, tenantB, {
			enabled_product_modules: ['campaign-assistant']
		});
		await expect(service.getPreferences(userA, tenantA)).resolves.toEqual({
			enabled_product_modules: ['campaign-assistant']
		});
		await expect(service.getPreferences(userB, tenantB)).resolves.toEqual({
			enabled_product_modules: ['campaign-assistant']
		});
		await expect(service.getPreferences(userB, tenantA)).resolves.toEqual({
			enabled_product_modules: ['untouched-contacts', 'referral-value']
		});
	});
});
