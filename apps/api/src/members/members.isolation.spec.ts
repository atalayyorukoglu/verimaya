import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { MembersService, type MemberPasswordResetSender } from './members.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

function makeMembersService(sender?: MemberPasswordResetSender): MembersService {
	const { db, sql } = getDb(databaseUrl);
	const dbService = { client: db, sql } as unknown as DbService;
	const service = new MembersService(new TenantContextService(dbService), dbService);
	if (sender) service.usePasswordResetSender(sender);
	return service;
}

describe('members list isolation (member table has no RLS — explicit org filter required)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const userA = randomUUID();
	const userB = randomUUID();
	let membersService: MembersService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

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

		membersService = makeMembersService();
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${userA}, ${userB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A sees only its own member, not Tenant B member', async () => {
		const result = await membersService.list(tenantA, { limit: 25 });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.tenant_id).toBe(tenantA);
		expect(result.items[0]!.email).toContain('user-a-');
		expect(result.items[0]!.display_name).toBe('User A');
		expect(result.items.some((m) => m.email.includes('user-b-'))).toBe(false);
	});

	it('Tenant B sees only its own member, not Tenant A member', async () => {
		const result = await membersService.list(tenantB, { limit: 25 });

		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.tenant_id).toBe(tenantB);
		expect(result.items[0]!.email).toContain('user-b-');
		expect(result.items[0]!.display_name).toBe('User B');
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
		const { sql } = getDb(databaseUrl);

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

		membersService = makeMembersService();
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${ownerA}, ${agentA}, ${ownerB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A cannot update Tenant B member (404)', async () => {
		await expect(
			membersService.update(
				tenantA,
				memberIdB,
				{ role: 'admin' },
				{ actorId: ownerA, actorDisplayName: 'Owner A' }
			)
		).rejects.toThrow(NotFoundException);
	});

	it('rejects changing own role', async () => {
		await expect(
			membersService.update(
				tenantA,
				memberIdA,
				{ role: 'admin' },
				{ actorId: ownerA, actorDisplayName: 'Owner A' }
			)
		).rejects.toThrow(ForbiddenException);
	});

	it('rejects demoting the last owner', async () => {
		await expect(
			membersService.update(
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
		const updated = await membersService.update(
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
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_type, entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`;
		});
		expect(logsA.length).toBeGreaterThanOrEqual(1);
		expect(logsA[0]?.actor_display_name).toBe('Owner A');
		expect(String(logsA[0]?.entity_label)).toContain('agent → manager');

		const logsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id from audit_logs
				where tenant_id = ${tenantB} and entity_type = 'user'
			`;
		});
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

		const demoted = await membersService.update(
			tenantA,
			memberIdA,
			{ role: 'admin' },
			{ actorId: secondOwnerUser, actorDisplayName: 'Owner A2' }
		);
		expect(demoted.role).toBe('admin');

		// Restore sole-owner shape for afterAll cleanliness; second owner stays so list still has an owner.
		await membersService.update(
			tenantA,
			memberIdA,
			{ role: 'owner' },
			{ actorId: secondOwnerUser, actorDisplayName: 'Owner A2' }
		);

		await sql`delete from member where id = ${secondOwnerMember}`;
		await sql`delete from "user" where id = ${secondOwnerUser}`;
	});
});

describe('members password-reset isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const ownerA = randomUUID();
	const agentA = randomUUID();
	const ownerB = randomUUID();
	const memberIdA = randomUUID();
	const agentMemberIdA = randomUUID();
	const memberIdB = randomUUID();
	const sent: Array<{ email: string; redirectTo: string }> = [];
	let membersService: MembersService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env.TRUSTED_ORIGINS = 'http://localhost:5173,http://app.localhost:5173';
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Reset Tenant A', ${`reset-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Reset Tenant B', ${`reset-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Reset Tenant A', ${`reset-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Reset Tenant B', ${`reset-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerA}, 'Reset Owner A', ${`reset-owner-a-${ownerA.slice(0, 8)}@example.com`}),
				(${agentA}, 'Reset Agent A', ${`reset-agent-a-${agentA.slice(0, 8)}@example.com`}),
				(${ownerB}, 'Reset Owner B', ${`reset-owner-b-${ownerB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${memberIdA}, ${tenantA}, ${ownerA}, 'owner', now()),
				(${agentMemberIdA}, ${tenantA}, ${agentA}, 'agent', now()),
				(${memberIdB}, ${tenantB}, ${ownerB}, 'owner', now())
		`;

		membersService = makeMembersService(async (input) => {
			sent.push(input);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${ownerA}, ${agentA}, ${ownerB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A cannot reset Tenant B member (404) and does not send mail', async () => {
		const before = sent.length;
		await expect(
			membersService.sendPasswordResetEmail(tenantA, memberIdB, {
				actorId: ownerA,
				actorDisplayName: 'Reset Owner A'
			})
		).rejects.toThrow(NotFoundException);
		expect(sent).toHaveLength(before);
	});

	it('rejects resetting own password', async () => {
		const before = sent.length;
		await expect(
			membersService.sendPasswordResetEmail(tenantA, memberIdA, {
				actorId: ownerA,
				actorDisplayName: 'Reset Owner A'
			})
		).rejects.toThrow(ForbiddenException);
		expect(sent).toHaveLength(before);
	});

	it('sends reset for a tenant member, writes audit, stays tenant-scoped', async () => {
		const result = await membersService.sendPasswordResetEmail(tenantA, agentMemberIdA, {
			actorId: ownerA,
			actorDisplayName: 'Reset Owner A'
		});
		expect(result).toEqual({ sent: true });
		expect(sent.at(-1)?.email).toContain('reset-agent-a-');
		expect(sent.at(-1)?.redirectTo).toBe('http://app.localhost:5173/reset-password');

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_type, entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`;
		});
		expect(logsA.length).toBeGreaterThanOrEqual(1);
		expect(logsA[0]?.actor_display_name).toBe('Reset Owner A');
		expect(String(logsA[0]?.entity_label)).toContain('password reset email');

		const logsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id from audit_logs
				where tenant_id = ${tenantB} and entity_type = 'user'
			`;
		});
		expect(logsB).toHaveLength(0);
	});
});

describe('members create isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const ownerA = randomUUID();
	const ownerB = randomUUID();
	const memberIdA = randomUUID();
	const memberIdB = randomUUID();
	const createdUserIds: string[] = [];
	let membersService: MembersService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Create Tenant A', ${`create-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Create Tenant B', ${`create-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Create Tenant A', ${`create-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Create Tenant B', ${`create-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerA}, 'Create Owner A', ${`create-owner-a-${ownerA.slice(0, 8)}@example.com`}),
				(${ownerB}, 'Create Owner B', ${`create-owner-b-${ownerB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${memberIdA}, ${tenantA}, ${ownerA}, 'owner', now()),
				(${memberIdB}, ${tenantB}, ${ownerB}, 'owner', now())
		`;

		membersService = makeMembersService();
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from account where user_id in (${ownerA}, ${ownerB})`;
		if (createdUserIds.length > 0) {
			await sql`delete from account where user_id in ${sql(createdUserIds)}`;
			await sql`delete from "user" where id in ${sql(createdUserIds)}`;
		}
		await sql`delete from "user" where id in (${ownerA}, ${ownerB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('creates a member in Tenant A without leaking into Tenant B', async () => {
		const email = `create-agent-${randomUUID().slice(0, 8)}@example.com`;
		const created = await membersService.create(
			tenantA,
			{
				email,
				display_name: 'Create Agent',
				role: 'agent',
				password: 'password123'
			},
			{ actorId: ownerA, actorDisplayName: 'Create Owner A' }
		);
		createdUserIds.push(created.user_id);

		expect(created.tenant_id).toBe(tenantA);
		expect(created.email).toBe(email);
		expect(created.role).toBe('agent');

		const listedA = await membersService.list(tenantA, { limit: 25 });
		expect(listedA.items.some((m) => m.email === email)).toBe(true);

		const listedB = await membersService.list(tenantB, { limit: 25 });
		expect(listedB.items.some((m) => m.email === email)).toBe(false);

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_type, entity_label, actor_display_name, action
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`;
		});
		expect(logsA[0]?.action).toBe('create');
		expect(logsA[0]?.entity_label).toBe(email);
		expect(logsA[0]?.actor_display_name).toBe('Create Owner A');
	});

	it('adds an existing Tenant B user as a member of Tenant A without removing B membership', async () => {
		const sharedEmail = `create-owner-b-${ownerB.slice(0, 8)}@example.com`;
		const created = await membersService.create(
			tenantA,
			{
				email: sharedEmail,
				display_name: 'Shared Owner B',
				role: 'agent',
				password: 'password123'
			},
			{ actorId: ownerA, actorDisplayName: 'Create Owner A' }
		);
		expect(created.user_id).toBe(ownerB);
		expect(created.tenant_id).toBe(tenantA);
		expect(created.role).toBe('agent');

		const listedB = await membersService.list(tenantB, { limit: 25 });
		expect(listedB.items.find((m) => m.user_id === ownerB)?.role).toBe('owner');
	});
});

describe('members password set isolation', () => {
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
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Pwd Tenant A', ${`pwd-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Pwd Tenant B', ${`pwd-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Pwd Tenant A', ${`pwd-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Pwd Tenant B', ${`pwd-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerA}, 'Pwd Owner A', ${`pwd-owner-a-${ownerA.slice(0, 8)}@example.com`}),
				(${agentA}, 'Pwd Agent A', ${`pwd-agent-a-${agentA.slice(0, 8)}@example.com`}),
				(${ownerB}, 'Pwd Owner B', ${`pwd-owner-b-${ownerB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${memberIdA}, ${tenantA}, ${ownerA}, 'owner', now()),
				(${agentMemberIdA}, ${tenantA}, ${agentA}, 'agent', now()),
				(${memberIdB}, ${tenantB}, ${ownerB}, 'owner', now())
		`;

		membersService = makeMembersService();
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from account where user_id in (${ownerA}, ${agentA}, ${ownerB})`;
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${ownerA}, ${agentA}, ${ownerB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A cannot set password for Tenant B member (404)', async () => {
		await expect(
			membersService.update(
				tenantA,
				memberIdB,
				{ password: 'password123' },
				{ actorId: ownerA, actorDisplayName: 'Pwd Owner A' }
			)
		).rejects.toThrow(NotFoundException);
	});

	it('rejects setting own password via this path', async () => {
		await expect(
			membersService.update(
				tenantA,
				memberIdA,
				{ password: 'password123' },
				{ actorId: ownerA, actorDisplayName: 'Pwd Owner A' }
			)
		).rejects.toThrow(ForbiddenException);
	});

	it('sets another member password and writes audit in Tenant A only', async () => {
		const updated = await membersService.update(
			tenantA,
			agentMemberIdA,
			{ password: 'password123' },
			{ actorId: ownerA, actorDisplayName: 'Pwd Owner A' }
		);
		expect(updated.id).toBe(agentMemberIdA);
		expect(updated.role).toBe('agent');

		const { sql } = getDb(databaseUrl);
		const accounts = await sql`
			select id from account
			where user_id = ${agentA} and provider_id = 'credential' and password is not null
		`;
		expect(accounts.length).toBeGreaterThanOrEqual(1);

		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`;
		});
		expect(String(logsA[0]?.entity_label)).toContain('password set');
		expect(logsA[0]?.actor_display_name).toBe('Pwd Owner A');

		const logsB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id from audit_logs
				where tenant_id = ${tenantB} and entity_type = 'user'
			`;
		});
		expect(logsB).toHaveLength(0);
	});
});

describe('members remove isolation', () => {
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
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Remove Tenant A', ${`remove-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Remove Tenant B', ${`remove-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Remove Tenant A', ${`remove-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Remove Tenant B', ${`remove-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerA}, 'Remove Owner A', ${`remove-owner-a-${ownerA.slice(0, 8)}@example.com`}),
				(${agentA}, 'Remove Agent A', ${`remove-agent-a-${agentA.slice(0, 8)}@example.com`}),
				(${ownerB}, 'Remove Owner B', ${`remove-owner-b-${ownerB.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values
				(${memberIdA}, ${tenantA}, ${ownerA}, 'owner', now()),
				(${agentMemberIdA}, ${tenantA}, ${agentA}, 'agent', now()),
				(${memberIdB}, ${tenantB}, ${ownerB}, 'owner', now())
		`;

		membersService = makeMembersService();
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${ownerA}, ${agentA}, ${ownerB})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A cannot remove Tenant B member (404)', async () => {
		await expect(
			membersService.remove(tenantA, memberIdB, {
				actorId: ownerA,
				actorDisplayName: 'Remove Owner A'
			})
		).rejects.toThrow(NotFoundException);
	});

	it('rejects removing self', async () => {
		await expect(
			membersService.remove(tenantA, memberIdA, {
				actorId: ownerA,
				actorDisplayName: 'Remove Owner A'
			})
		).rejects.toThrow(BadRequestException);
	});

	it('rejects removing the last owner', async () => {
		await expect(
			membersService.remove(tenantA, memberIdA, {
				actorId: agentA,
				actorDisplayName: 'Remove Agent A'
			})
		).rejects.toThrow(BadRequestException);

		const listed = await membersService.list(tenantA, { limit: 25 });
		expect(listed.items.find((m) => m.id === memberIdA)?.role).toBe('owner');
	});

	it('removes a tenant member, writes audit, leaves Tenant B intact', async () => {
		const result = await membersService.remove(tenantA, agentMemberIdA, {
			actorId: ownerA,
			actorDisplayName: 'Remove Owner A'
		});
		expect(result).toEqual({ id: agentMemberIdA, deleted: true });

		const listedA = await membersService.list(tenantA, { limit: 25 });
		expect(listedA.items.some((m) => m.id === agentMemberIdA)).toBe(false);

		const listedB = await membersService.list(tenantB, { limit: 25 });
		expect(listedB.items).toHaveLength(1);
		expect(listedB.items[0]!.id).toBe(memberIdB);

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select action, entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_type = 'user'
				order by created_at desc
			`;
		});
		expect(logsA[0]?.action).toBe('delete');
		expect(String(logsA[0]?.entity_label)).toContain('remove-agent-a-');
		expect(logsA[0]?.actor_display_name).toBe('Remove Owner A');
	});
});
