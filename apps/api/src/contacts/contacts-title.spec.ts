import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * `contacts.title_id` / `title_name` — ünvan opsiyonel, kişi başına tek ünvan.
 * Tenant mock: drizzle `db.transaction` + SET LOCAL (is_local=true) (AGENTS.md).
 *
 * `createWithDb`/`updateWithDb` take `db` directly (controller-managed transaction in
 * production) — each call here is wrapped in its own SET LOCAL transaction via
 * `runWithTenant` instead of a forbidden session-level `set_config`.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('contacts title_id', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let service: ContactsService;
	let runWithTenant: <T>(tenantId: string, fn: (db: TenantDb) => Promise<T>) => Promise<T>;
	let contactTypeIdA: string;
	let titleHekim: string;
	let titleKoordinator: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		runWithTenant = async (tenantId, fn) =>
			db.transaction(async (tx) => {
				await tx.execute(
					drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
				);
				return fn(tx as TenantDb);
			});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				runWithTenant(id, (tx) => fn({ db: tx }))
		} as TenantContextService;

		service = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Contact Title A', ${`ct-title-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Contact Title B', ${`ct-title-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Contact Title A', ${`ct-title-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Contact Title B', ${`ct-title-b-${tenantB.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Personel') returning id
			`;
			contactTypeIdA = ct!.id as string;
			const [t1] = await tx`
				insert into contact_titles (tenant_id, name) values (${tenantA}, 'Hekim') returning id
			`;
			const [t2] = await tx`
				insert into contact_titles (tenant_id, name) values (${tenantA}, 'Koordinatör') returning id
			`;
			titleHekim = t1!.id as string;
			titleKoordinator = t2!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('creates a contact with a title, denormalizing title_name', async () => {
		const created = await runWithTenant(tenantA, (tx) =>
			service.createWithDb(tx, tenantA, {
				contact_type_id: contactTypeIdA,
				title_id: titleHekim,
				first_name: 'Doktor'
			})
		);
		expect(created.title_id).toBe(titleHekim);
		expect(created.title_name).toBe('Hekim');
	});

	it('creates a contact with no title — title_id/title_name stay null', async () => {
		const created = await runWithTenant(tenantA, (tx) =>
			service.createWithDb(tx, tenantA, {
				contact_type_id: contactTypeIdA,
				first_name: 'Titleless'
			})
		);
		expect(created.title_id).toBeNull();
		expect(created.title_name).toBeNull();
	});

	it('rejects an unknown title_id with not_found', async () => {
		await expect(
			runWithTenant(tenantA, (tx) =>
				service.createWithDb(tx, tenantA, {
					contact_type_id: contactTypeIdA,
					title_id: randomUUID(),
					first_name: 'Ghost'
				})
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('updates a contact title and clears it back to null', async () => {
		const created = await runWithTenant(tenantA, (tx) =>
			service.createWithDb(tx, tenantA, {
				contact_type_id: contactTypeIdA,
				title_id: titleHekim,
				first_name: 'Değişken'
			})
		);

		const updated = await runWithTenant(tenantA, (tx) =>
			service.updateWithDb(tx, created.id, { title_id: titleKoordinator })
		);
		expect(updated.title_id).toBe(titleKoordinator);
		expect(updated.title_name).toBe('Koordinatör');

		const cleared = await runWithTenant(tenantA, (tx) =>
			service.updateWithDb(tx, created.id, { title_id: null })
		);
		expect(cleared.title_id).toBeNull();
		expect(cleared.title_name).toBeNull();

		// A field left untouched on a later update must not lose its title.
		const withTitle = await runWithTenant(tenantA, (tx) =>
			service.updateWithDb(tx, created.id, { title_id: titleHekim })
		);
		const stillHekim = await runWithTenant(tenantA, (tx) =>
			service.updateWithDb(tx, created.id, { first_name: 'Değişken 2' })
		);
		expect(withTitle.title_id).toBe(titleHekim);
		expect(stillHekim.title_id).toBe(titleHekim);
		expect(stillHekim.title_name).toBe('Hekim');
	});

	it('filters the contact list by title_id, isolated per tenant', async () => {
		const hekimContact = await runWithTenant(tenantA, (tx) =>
			service.createWithDb(tx, tenantA, {
				contact_type_id: contactTypeIdA,
				title_id: titleHekim,
				first_name: 'Filtre Hekim'
			})
		);
		const koordinatorContact = await runWithTenant(tenantA, (tx) =>
			service.createWithDb(tx, tenantA, {
				contact_type_id: contactTypeIdA,
				title_id: titleKoordinator,
				first_name: 'Filtre Koordinatör'
			})
		);

		const byHekim = await service.list(tenantA, { limit: 50, title_id: titleHekim });
		const idsHekim = byHekim.items.map((c) => c.id);
		expect(idsHekim).toContain(hekimContact.id);
		expect(idsHekim).not.toContain(koordinatorContact.id);

		const byKoordinator = await service.list(tenantA, { limit: 50, title_id: titleKoordinator });
		expect(byKoordinator.items.map((c) => c.id)).toContain(koordinatorContact.id);

		// Tenant B has no rows with Tenant A's title id — RLS scopes the filter away.
		const crossTenant = await service.list(tenantB, { limit: 50, title_id: titleHekim });
		expect(crossTenant.items).toEqual([]);
	});
});
