import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { dataDeletionRequests } from '../db/schema/data-deletion-requests';
import { user } from '../db/schema/auth';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { DataSubjectService } from './data-subject.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-F09-07: panel-user data-export + data-deletion-request.
 * Tenant mock mirrors production: drizzle transaction + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const actorA = { actorId: null as string | null, actorDisplayName: 'AuditF09-07 A' };

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

describe('AUDIT-F09-07 data-subject rights isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const userA = randomUUID();
	const userB = randomUUID();
	const userBoth = randomUUID();
	let service: DataSubjectService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'DS Tenant A', ${`ds-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'DS Tenant B', ${`ds-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'DS Tenant A', ${`ds-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'DS Tenant B', ${`ds-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${userA}, 'User A', ${`user-a-${userA.slice(0, 8)}@example.com`}),
				(${userB}, 'User B Secret', ${`user-b-${userB.slice(0, 8)}@example.com`}),
				(${userBoth}, 'User Multi', ${`user-m-${userBoth.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${tenantA}, ${userA}, 'agent', now()),
				(${tenantB}, ${userB}, 'agent', now()),
				(${tenantA}, ${userBoth}, 'agent', now()),
				(${tenantB}, ${userBoth}, 'agent', now())
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into audit_logs (tenant_id, actor_id, actor_display_name, action, entity_type, entity_label)
				values
					(${tenantA}, ${userA}, 'User A', 'create', 'contact', 'own-audit'),
					(${tenantA}, ${userBoth}, 'User Multi', 'create', 'contact', 'other-member-audit')
			`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into audit_logs (tenant_id, actor_id, actor_display_name, action, entity_type, entity_label)
				values (${tenantB}, ${userB}, 'User B Secret', 'create', 'contact', 'tenant-b-secret')
			`;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		service = new DataSubjectService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from data_deletion_requests where tenant_id = ${tenantA}`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from data_deletion_requests where tenant_id = ${tenantB}`;
			await tx`delete from audit_logs where tenant_id = ${tenantB}`;
		});
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id in (${userA}, ${userB}, ${userBoth})`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A export cannot read Tenant B subject or Tenant B audit logs', async () => {
		const exported = await service.exportData(tenantA, userA);

		expect(exported.tenant_id).toBe(tenantA);
		expect(exported.subject.id).toBe(userA);
		expect(exported.subject.email).toContain('user-a-');
		expect(exported.audit_logs_as_actor.every((l) => l.tenant_id === tenantA)).toBe(true);
		expect(exported.audit_logs_as_actor.some((l) => l.entity_label === 'tenant-b-secret')).toBe(
			false
		);
		expect(exported.subject.email).not.toContain('user-b-');
		expect(JSON.stringify(exported)).not.toContain('User B Secret');
	});

	it('export does not leak another member’s audit rows in the same tenant', async () => {
		const exported = await service.exportData(tenantA, userA);
		expect(exported.audit_logs_as_actor.map((l) => l.entity_label)).toEqual(['own-audit']);
		expect(exported.audit_logs_as_actor.some((l) => l.actor_id === userBoth)).toBe(false);
	});

	it('Tenant A cannot export Tenant B user (not a member) — unauthorized', async () => {
		await expect(service.exportData(tenantA, userB)).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('Tenant A cannot file deletion for Tenant B user — unauthorized', async () => {
		await expect(
			service.requestDeletion(tenantA, userB, { ...actorA, actorId: userA })
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('deletion-request anonymizes identifying fields but does not hard-delete the user row', async () => {
		const beforeEmail = `user-a-${userA.slice(0, 8)}@example.com`;
		const result = await service.requestDeletion(tenantA, userA, {
			actorId: userA,
			actorDisplayName: 'User A'
		});

		expect(result.status).toBe('applied');
		expect(result.anonymized_at).toBeTruthy();
		expect(result.subject_user_id).toBe(userA);

		const { db } = getDb(databaseUrl);
		const [stillThere] = await db.select().from(user).where(eq(user.id, userA)).limit(1);
		expect(stillThere).toBeTruthy();
		expect(stillThere!.email).not.toBe(beforeEmail);
		expect(stillThere!.email).toContain('anonymized-');
		expect(stillThere!.name).toBe('Anonymized User');

		const [reqRow] = await withTenantSession(tenantA, (tdb) =>
			tdb.select().from(dataDeletionRequests).where(eq(dataDeletionRequests.id, result.id))
		);
		expect(reqRow).toBeTruthy();
		expect(reqRow!.status).toBe('applied');

		// Repeat converges — no second anonymization pass required
		const again = await service.requestDeletion(tenantA, userA, {
			actorId: userA,
			actorDisplayName: 'Anonymized User'
		});
		expect(again.id).toBe(result.id);
	});

	it('multi-org deletion records received without global anonymization', async () => {
		const result = await service.requestDeletion(tenantA, userBoth, {
			actorId: userBoth,
			actorDisplayName: 'User Multi'
		});
		expect(result.status).toBe('received');
		expect(result.anonymized_at).toBeNull();

		const { db } = getDb(databaseUrl);
		const [row] = await db.select().from(user).where(eq(user.id, userBoth)).limit(1);
		expect(row!.email).toContain('user-m-');
		expect(row!.name).toBe('User Multi');
	});

	it('Tenant B negative: cannot export Tenant A subject under Tenant B context', async () => {
		await expect(service.exportData(tenantB, userA)).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('Tenant B negative: cannot delete-request Tenant A subject', async () => {
		await expect(
			service.requestDeletion(tenantB, userA, { actorId: userB, actorDisplayName: 'User B' })
		).rejects.toBeInstanceOf(ForbiddenException);
	});
});
