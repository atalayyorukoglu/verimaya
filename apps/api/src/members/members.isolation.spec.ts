import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
		await withTenantSession(tenantA, async () => {
			await sql`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from audit_logs where tenant_id = ${tenantB}`;
		});
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

describe('members role update isolation (GAP-02)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const ownerA = randomUUID();
	const agentA = randomUUID();
	const ownerB = randomUUID();
	const memberIdA = randomUUID();
	const agentMemberIdA = randomUUID();
	const memberIdB = randomUUID();
	let membersService: MembersService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Role Tenant A', ${`role-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Role Tenant B', ${`role-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Role Tenant A', ${`role-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Role Tenant B', ${`role-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerA}, 'Owner A', ${`owner-a-${ownerA.slice(0, 8)}@example.com`}),
				(${agentA}, 'Agent A', ${`agent-a-${agentA.slice(0, 8)}@example.com`}),
				(${ownerB}, 'Owner B', ${`owner-b-${ownerB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${memberIdA}, ${tenantA}, ${ownerA}, 'owner', now()),
				(${agentMemberIdA}, ${tenantA}, ${agentA}, 'agent', now()),
				(${memberIdB}, ${tenantB}, ${ownerB}, 'owner', now())
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		membersService = new MembersService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${ownerA}, ${agentA}, ${ownerB})`;
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot update Tenant B member (404)', async () => {
		await expect(
			membersService.updateRole(
				tenantA,
				memberIdB,
				{ role: 'admin' },
				{ actorId: ownerA, actorDisplayName: 'Owner A' }
			)
		).rejects.toThrow(NotFoundException);
	});

	it('rejects changing own role', async () => {
		await expect(
			membersService.updateRole(
				tenantA,
				memberIdA,
				{ role: 'admin' },
				{ actorId: ownerA, actorDisplayName: 'Owner A' }
			)
		).rejects.toThrow(ForbiddenException);
	});

	it('rejects demoting the last owner', async () => {
		await expect(
			membersService.updateRole(
				tenantA,
				memberIdA,
				{ role: 'admin' },
				{ actorId: agentA, actorDisplayName: 'Agent A' }
			)
		).rejects.toThrow(BadRequestException);

		const listed = await membersService.list(tenantA, { limit: 25 });
		expect(listed.items.find((m) => m.id === memberIdA)?.role).toBe('owner');
	});

	it('updates another member role, writes audit, stays tenant-scoped', async () => {
		const updated = await membersService.updateRole(
			tenantA,
			agentMemberIdA,
			{ role: 'manager' },
			{ actorId: ownerA, actorDisplayName: 'Owner A' }
		);
		expect(updated.role).toBe('manager');
		expect(updated.id).toBe(agentMemberIdA);

		const listedA = await membersService.list(tenantA, { limit: 25 });
		expect(listedA.items.find((m) => m.id === agentMemberIdA)?.role).toBe('manager');

		const listedB = await membersService.list(tenantB, { limit: 25 });
		expect(listedB.items.every((m) => m.role === 'owner')).toBe(true);

		const { sql } = getDb(databaseUrl);
		const logsA = await withTenantSession(tenantA, () =>
			sql`
				select entity_type, entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`
		);
		expect(logsA.length).toBeGreaterThanOrEqual(1);
		expect(logsA[0]?.actor_display_name).toBe('Owner A');
		expect(String(logsA[0]?.entity_label)).toContain('agent → manager');

		const logsB = await withTenantSession(tenantB, () =>
			sql`
				select id from audit_logs
				where tenant_id = ${tenantB} and entity_type = 'user'
			`
		);
		expect(logsB).toHaveLength(0);
	});

	it('allows demoting an owner when another owner remains', async () => {
		const secondOwnerUser = randomUUID();
		const secondOwnerMember = randomUUID();
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into "user" (id, name, email)
			values (${secondOwnerUser}, 'Owner A2', ${`owner-a2-${secondOwnerUser.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values (${secondOwnerMember}, ${tenantA}, ${secondOwnerUser}, 'owner', now())
		`;

		const demoted = await membersService.updateRole(
			tenantA,
			memberIdA,
			{ role: 'admin' },
			{ actorId: secondOwnerUser, actorDisplayName: 'Owner A2' }
		);
		expect(demoted.role).toBe('admin');

		// Restore sole-owner shape for afterAll cleanliness; second owner stays so list still has an owner.
		await membersService.updateRole(
			tenantA,
			memberIdA,
			{ role: 'owner' },
			{ actorId: secondOwnerUser, actorDisplayName: 'Owner A2' }
		);

		await sql`delete from member where id = ${secondOwnerMember}`;
		await sql`delete from "user" where id = ${secondOwnerUser}`;
	});
});
