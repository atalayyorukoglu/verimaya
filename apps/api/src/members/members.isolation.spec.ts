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
	const userA2 = randomUUID();
	const memberA2 = randomUUID();
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
				(${userB}, 'User B', ${`user-b-${userB.slice(0, 8)}@example.com`}),
				(${userA2}, 'User A2', ${`user-a2-${userA2.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${randomUUID()}, ${tenantA}, ${userA}, 'owner', now()),
				(${memberA2}, ${tenantA}, ${userA2}, 'agent', now()),
				(${randomUUID()}, ${tenantB}, ${userB}, 'owner', now())
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		membersService = new MembersService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from audit_logs where tenant_id in (${tenantA}, ${tenantB})`;
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${userA}, ${userB}, ${userA2})`;
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A sees only its own members, not Tenant B member', async () => {
		const result = await membersService.list(tenantA, { limit: 25 });

		expect(result.items).toHaveLength(2);
		expect(result.items.every((m) => m.tenant_id === tenantA)).toBe(true);
		expect(result.items.some((m) => m.email.includes('user-b-'))).toBe(false);
	});

	it('Tenant B sees only its own member, not Tenant A members', async () => {
		const result = await membersService.list(tenantB, { limit: 25 });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.tenant_id).toBe(tenantB);
		expect(result.items[0]!.email).toContain('user-b-');
		expect(result.items.some((m) => m.email.includes('user-a-'))).toBe(false);
	});

	it('Tenant A admin cannot update Tenant B member role', async () => {
		const tenantBMembers = await membersService.list(tenantB, { limit: 1 });
		const targetId = tenantBMembers.items[0]!.id;

		await expect(
			membersService.updateRole(
				tenantA,
				targetId,
				{ role: 'readonly' },
				{ actorId: userA, actorDisplayName: 'User A' }
			)
		).rejects.toMatchObject({ status: 404 });
	});

	it('member cannot change their own role', async () => {
		const tenantAMembers = await membersService.list(tenantA, { limit: 25 });
		const self = tenantAMembers.items.find((m) => m.email.includes('user-a-'))!;

		await expect(
			membersService.updateRole(
				tenantA,
				self.id,
				{ role: 'readonly' },
				{ actorId: userA, actorDisplayName: 'User A' }
			)
		).rejects.toMatchObject({ status: 403 });
	});

	it('org admin can change another member role and writes audit log', async () => {
		const updated = await membersService.updateRole(
			tenantA,
			memberA2,
			{ role: 'manager' },
			{ actorId: userA, actorDisplayName: 'User A' }
		);

		expect(updated.role).toBe('manager');

		const { sql } = getDb(databaseUrl);
		const logs = await sql<{ entity_label: string }[]>`
			select entity_label from audit_logs
			where tenant_id = ${tenantA} and entity_type = 'user' and action = 'update'
			order by created_at desc
			limit 1
		`;
		expect(logs[0]?.entity_label).toContain('agent → manager');
	});
});
