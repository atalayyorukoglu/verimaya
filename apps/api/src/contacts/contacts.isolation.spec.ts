import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';

/**
 * TEST-01 (Faz 2.4): contacts tenant isolation. Same template as
 * `webhook-subscriptions.isolation.spec.ts` — services instantiated directly with a faked
 * `TenantContextService` so `SET LOCAL app.current_tenant_id` (real Postgres RLS, not an
 * app-level `where tenant_id = ...`) is what actually does the blocking.
 *
 * Needs a live Postgres (DATABASE_URL_APP) — see 0.3. Not runnable in this sandbox (no
 * docker); written and reasoned through, not executed.
 *
 * Scope note: `ContactsController` has no `DELETE` route and `ContactsService` has no
 * `remove()` — there is nothing to test for delete-isolation on this resource today (the
 * plan doc's "list/get/update/delete" is aspirational for contacts). What's covered here is
 * everything that actually exists: list, get-by-id, update, and filter-based leakage.
 */

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

describe('contacts tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let contactA: string;
	let contactB: string;
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

		contactTypeA = await withTenantSession(tenantA, async () => {
			const [row] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik A') returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await withTenantSession(tenantB, async () => {
			const [row] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Klinik B') returning id
			`;
			return row!.id as string;
		});

		contactA = await withTenantSession(tenantA, async () => {
			const created = await service.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Contact A'
			});
			return created.id;
		});
		contactB = await withTenantSession(tenantB, async () => {
			const created = await service.createWithDb(db, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Contact B'
			});
			return created.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from contacts where tenant_id = ${tenantA}`;
			await sql`delete from contact_types where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from contacts where tenant_id = ${tenantB}`;
			await sql`delete from contact_types where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own contact', async () => {
		const result = await service.list(tenantA, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([contactA]);
		expect(result.items.some((c) => c.id === contactB)).toBe(false);
	});

	it('Tenant B lists only its own contact', async () => {
		const result = await service.list(tenantB, { limit: 25 });
		expect(result.items.map((c) => c.id)).toEqual([contactB]);
		expect(result.items.some((c) => c.id === contactA)).toBe(false);
	});

	it('Tenant A cannot get Tenant B contact by id (404, not a leak)', async () => {
		await expect(service.get(tenantA, contactB)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant A cannot update Tenant B contact', async () => {
		await withTenantSession(tenantA, async () => {
			await expect(
				service.updateWithDb(db, contactB, { display_name: 'Hacked by A' })
			).rejects.toBeInstanceOf(NotFoundException);
		});

		const stillB = await service.get(tenantB, contactB);
		expect(stillB.display_name).toBe('Contact B');
	});

	it("Tenant A's type_id filter using Tenant B's contact type does not leak Tenant B's contact", async () => {
		const result = await service.list(tenantA, { limit: 25, type_id: contactTypeB });
		expect(result.items).toHaveLength(0);
	});
});
