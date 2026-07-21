import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { MembersService } from './members.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('members list isolation (member table has no RLS — explicit org filter required)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const userA = randomUUID();
	const userB = randomUUID();
	let membersService: MembersService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${userA}, 'User A', ${`user-a-${userA.slice(0, 8)}@example.com`}),
				(${userB}, 'User B', ${`user-b-${userB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${userA}, 'owner', now()),
				(${tenantB}, ${userB}, 'owner', now())
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		membersService = new MembersService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${userA}, ${userB})`;
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A sees only its own member, not Tenant B member', async () => {
		const result = await membersService.list(tenantA, { limit: 25 });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.tenant_id).toBe(tenantA);
		expect(result.items[0]!.email).toContain('user-a-');
		expect(result.items.some((m) => m.email.includes('user-b-'))).toBe(false);
	});

	it('Tenant B sees only its own member, not Tenant A member', async () => {
		const result = await membersService.list(tenantB, { limit: 25 });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.tenant_id).toBe(tenantB);
		expect(result.items[0]!.email).toContain('user-b-');
		expect(result.items.some((m) => m.email.includes('user-a-'))).toBe(false);
	});
});
