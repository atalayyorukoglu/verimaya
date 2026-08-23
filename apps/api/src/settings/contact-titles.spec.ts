import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_CONTACT_TITLE_NAMES } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * `contact_titles` — ünvan/görev sözlüğü. Desen `contact_types` ile birebir aynı, tek
 * bilinçli fark: silme `contact_types`'ın aksine kullanımda diye reddetmez — kişi başına
 * tek ünvan opsiyoneldir ve `contacts.title_id` ON DELETE SET NULL'dır (bkz.
 * docs/2026-08-23-maya-icgoru-sorulari.md § Risk 3, AGENTS.md).
 *
 * Tenant mock: drizzle `db.transaction` + SET LOCAL (is_local=true) — session-level
 * set_config kullanılmaz (AGENTS.md).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('contact_titles settings CRUD', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const freshTenant = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Title A', ${`title-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Title B', ${`title-b-${tenantB.slice(0, 8)}`}, now()),
				(${freshTenant}, 'Title Fresh', ${`title-f-${freshTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Title A', ${`title-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Title B', ${`title-b-${tenantB.slice(0, 8)}`}),
				(${freshTenant}, 'Title Fresh', ${`title-f-${freshTenant.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB, freshTenant]);
		await closeDb();
	});

	it('seeds the default title names once and never reseeds after all are deleted', async () => {
		const first = await settingsService.listContactTitles(freshTenant);
		expect(first.items.map((i) => i.name).sort()).toEqual(
			[...DEFAULT_CONTACT_TITLE_NAMES].sort()
		);

		for (const item of first.items) {
			await settingsService.deleteContactTitle(freshTenant, item.id);
		}

		const after = await settingsService.listContactTitles(freshTenant);
		expect(after.items).toEqual([]);
	});

	it('creates a contact title and rejects duplicate names case-insensitively', async () => {
		const created = await settingsService.createContactTitle(tenantA, { name: 'Hekim' });
		expect(created.name).toBe('Hekim');

		try {
			await settingsService.createContactTitle(tenantA, { name: 'hekim' });
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error?: { code?: string };
			};
			expect(body.error?.code).toBe('duplicate_type_name');
		}
	});

	it('renames a contact title and syncs the denormalized contacts.title_name', async () => {
		const { sql } = getDb(databaseUrl);
		const created = await settingsService.createContactTitle(tenantA, { name: 'koordinator' });

		const contactId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Personel', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
				returning id
			`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, title_id, title_name, display_name)
				values (${tenantA}, ${ct!.id}, 'Personel', ${created.id}, ${created.name}, 'Linked Koordinatör')
				returning id
			`;
			return row!.id as string;
		});

		const renamed = await settingsService.updateContactTitle(tenantA, created.id, {
			name: 'Koordinatör'
		});
		expect(renamed.name).toBe('Koordinatör');

		const synced = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`select title_name from contacts where id = ${contactId}`;
			return row!.title_name as string;
		});
		expect(synced).toBe('Koordinatör');
	});

	it('reorders contact titles atomically and returns the real updated count', async () => {
		const a1 = await settingsService.createContactTitle(tenantA, {
			name: `Reorder-1-${randomUUID().slice(0, 8)}`
		});
		const a2 = await settingsService.createContactTitle(tenantA, {
			name: `Reorder-2-${randomUUID().slice(0, 8)}`
		});

		const result = await settingsService.reorderContactTitles(tenantA, {
			items: [
				{ id: a1.id, sort_order: 5 },
				{ id: a2.id, sort_order: 3 }
			]
		});
		expect(result.updated).toBe(2);

		const list = await settingsService.listContactTitles(tenantA);
		const byId = Object.fromEntries(list.items.map((i) => [i.id, i.sort_order]));
		expect(byId[a1.id]).toBe(5);
		expect(byId[a2.id]).toBe(3);
	});

	it('deletes a title in use — contacts survive with title cleared (SET NULL), unlike contact_type', async () => {
		const { sql } = getDb(databaseUrl);
		const title = await settingsService.createContactTitle(tenantA, {
			name: `Doomed-${randomUUID().slice(0, 8)}`
		});

		const contactId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Personel', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
				returning id
			`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, title_id, title_name, display_name)
				values (${tenantA}, ${ct!.id}, 'Personel', ${title.id}, ${title.name}, 'Survivor')
				returning id
			`;
			return row!.id as string;
		});

		// Unlike deleteContactType (blocks with BadRequestException while in use), a
		// title in use deletes cleanly — contacts fall back to no title.
		await expect(settingsService.deleteContactTitle(tenantA, title.id)).resolves.toBeUndefined();

		const survivor = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				select title_id, title_name, display_name from contacts where id = ${contactId}
			`;
			return row!;
		});
		expect(survivor.title_id).toBeNull();
		expect(survivor.title_name).toBeNull();
		expect(survivor.display_name).toBe('Survivor');
	});

	it('throws not_found when deleting or renaming an unknown contact title', async () => {
		await expect(settingsService.deleteContactTitle(tenantA, randomUUID())).rejects.toThrow(
			NotFoundException
		);
		await expect(
			settingsService.updateContactTitle(tenantA, randomUUID(), { name: 'x' })
		).rejects.toThrow(NotFoundException);
	});

	it('isolates tenants: Tenant A cannot see, rename, or delete Tenant B titles', async () => {
		const name = `Shared-${randomUUID().slice(0, 8)}`;
		const onA = await settingsService.createContactTitle(tenantA, { name });
		const onB = await settingsService.createContactTitle(tenantB, { name });
		expect(onA.name).toBe(name);
		expect(onB.name).toBe(name);

		const listA = await settingsService.listContactTitles(tenantA);
		expect(listA.items.some((i) => i.id === onB.id)).toBe(false);

		await expect(
			settingsService.updateContactTitle(tenantA, onB.id, { name: `${name}-hijack` })
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(settingsService.deleteContactTitle(tenantA, onB.id)).rejects.toBeInstanceOf(
			NotFoundException
		);

		const stillB = await settingsService.updateContactTitle(tenantB, onB.id, {
			name: `${name}-ok`
		});
		expect(stillB.name).toBe(`${name}-ok`);
	});
});
