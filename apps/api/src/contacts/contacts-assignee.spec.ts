import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

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

describe('contacts assigned_user_id', () => {
	const tenantId = randomUUID();
	const userId = randomUUID();
	const memberId = randomUUID();
	let contactTypeId: string;
	let contactId: string;
	let service: ContactsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, () => fn({ db }))
		} as TenantContextService;

		service = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Assignee Tenant', ${`assignee-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Assignee Tenant', ${`assignee-${tenantId.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email, email_verified, created_at, updated_at)
			values (
				${userId},
				'Assignee Agent',
				${`assignee-${userId.slice(0, 8)}@example.com`},
				true,
				now(),
				now()
			)
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values (${memberId}, ${tenantId}, ${userId}, 'agent', now())
		`;

		contactTypeId = await withTenantSession(tenantId, async () => {
			const [row] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantId}, 'Hasta') returning id
			`;
			return row!.id as string;
		});

		contactId = await withTenantSession(tenantId, async () => {
			const created = await service.createWithDb(db, tenantId, {
				contact_type_id: contactTypeId,
				first_name: 'Patient'
			});
			return created.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await sql`delete from "user" where id = ${userId}`;
		await closeDb();
	});

	it('accepts auth user id', async () => {
		const updated = await withTenantSession(tenantId, () =>
			service.updateWithDb(db, contactId, { assigned_user_id: userId })
		);
		expect(updated.assigned_user_id).toBe(userId);
	});

	it('accepts legacy membership row id and stores auth user id', async () => {
		const updated = await withTenantSession(tenantId, () =>
			service.updateWithDb(db, contactId, { assigned_user_id: memberId })
		);
		expect(updated.assigned_user_id).toBe(userId);
	});

	it('rejects ids that are not org members', async () => {
		await expect(
			withTenantSession(tenantId, () =>
				service.updateWithDb(db, contactId, { assigned_user_id: randomUUID() })
			)
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
