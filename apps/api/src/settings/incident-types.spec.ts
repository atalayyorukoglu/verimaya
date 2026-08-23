import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_INCIDENT_TYPE_NAMES_CLINIC } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import type { CryptoService } from '../common/crypto.service';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { SettingsService } from './settings.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * `incident_types` — olay türü sözlüğü. Desen `contact_titles` ile birebir aynı +
 * `area` filtresi/kolonu, tek bilinçli fark `contact_titles`'ın aksine: silme
 * kullanımda diye RESTRICT ile reddedilir (tür olayın ne olduğunu tanımlıyor —
 * bkz. docs/2026-08-23-maya-icgoru-sorulari.md § 5, migration 0066).
 *
 * Tenant mock: drizzle `db.transaction` + SET LOCAL (is_local=true) — session-level
 * set_config kullanılmaz (AGENTS.md).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: (tdb: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

describe('incident_types settings CRUD', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const freshTenant = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (db) => fn({ db }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Incident Type A', ${`itype-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Incident Type B', ${`itype-b-${tenantB.slice(0, 8)}`}, now()),
				(${freshTenant}, 'Incident Type Fresh', ${`itype-f-${freshTenant.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Incident Type A', ${`itype-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Incident Type B', ${`itype-b-${tenantB.slice(0, 8)}`}),
				(${freshTenant}, 'Incident Type Fresh', ${`itype-f-${freshTenant.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB, freshTenant]);
		await closeDb();
	});

	it('seeds the four clinic default names once (area=clinic) and never reseeds after all are deleted', async () => {
		const first = await settingsService.listIncidentTypes(freshTenant, { area: 'clinic' });
		expect(first.items.map((i) => i.name).sort()).toEqual(
			[...DEFAULT_INCIDENT_TYPE_NAMES_CLINIC].sort()
		);
		expect(first.items.every((i) => i.area === 'clinic')).toBe(true);

		for (const item of first.items) {
			await settingsService.deleteIncidentType(freshTenant, item.id);
		}

		const after = await settingsService.listIncidentTypes(freshTenant, { area: 'clinic' });
		expect(after.items).toEqual([]);
	});

	it('does not seed other areas — area=hotel starts empty, no side effect on clinic seeding', async () => {
		const hotel = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`insert into organization (id, name, slug, created_at) values (${hotel}, 'Hotel Area', ${`hotel-${hotel.slice(0, 8)}`}, now())`;
		await sql`insert into tenants (id, name, slug) values (${hotel}, 'Hotel Area', ${`hotel-${hotel.slice(0, 8)}`})`;

		const hotelList = await settingsService.listIncidentTypes(hotel, { area: 'hotel' });
		expect(hotelList.items).toEqual([]);

		await purgeTenantFixtures(sql, [hotel]);
	});

	it('creates an incident type and rejects duplicate names within the same area (case-insensitive)', async () => {
		const created = await settingsService.createIncidentType(tenantA, {
			area: 'clinic',
			name: 'Komplikasyon Deneme'
		});
		expect(created.name).toBe('Komplikasyon Deneme');
		expect(created.area).toBe('clinic');

		try {
			await settingsService.createIncidentType(tenantA, {
				area: 'clinic',
				name: 'komplikasyon deneme'
			});
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
		}

		// Same name, different area — allowed (unique index is per (tenant, area, name)).
		const otherArea = await settingsService.createIncidentType(tenantA, {
			area: 'hotel',
			name: 'Komplikasyon Deneme'
		});
		expect(otherArea.area).toBe('hotel');
	});

	it('renames an incident type; area stays fixed (update schema has no area field)', async () => {
		const created = await settingsService.createIncidentType(tenantA, {
			area: 'clinic',
			name: `Rename-${randomUUID().slice(0, 8)}`
		});
		const renamed = await settingsService.updateIncidentType(tenantA, created.id, {
			name: 'Yeniden Adlandırıldı'
		});
		expect(renamed.name).toBe('Yeniden Adlandırıldı');
		expect(renamed.area).toBe('clinic');
	});

	it('reorders incident types atomically and returns the real updated count', async () => {
		const a1 = await settingsService.createIncidentType(tenantA, {
			area: 'clinic',
			name: `Reorder-1-${randomUUID().slice(0, 8)}`
		});
		const a2 = await settingsService.createIncidentType(tenantA, {
			area: 'clinic',
			name: `Reorder-2-${randomUUID().slice(0, 8)}`
		});

		const result = await settingsService.reorderIncidentTypes(tenantA, {
			items: [
				{ id: a1.id, sort_order: 5 },
				{ id: a2.id, sort_order: 3 }
			]
		});
		expect(result.updated).toBe(2);

		const list = await settingsService.listIncidentTypes(tenantA, { area: 'clinic' });
		const byId = Object.fromEntries(list.items.map((i) => [i.id, i.sort_order]));
		expect(byId[a1.id]).toBe(5);
		expect(byId[a2.id]).toBe(3);
	});

	it('RESTRICT: an incident type in use cannot be deleted (unlike contact_titles)', async () => {
		const { sql } = getDb(databaseUrl);
		const type = await settingsService.createIncidentType(tenantA, {
			area: 'clinic',
			name: `Kullanimda-${randomUUID().slice(0, 8)}`
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name
				returning id
			`;
			const [contact] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantA}, ${ct!.id}, 'Hasta', 'RESTRICT Test Hasta')
				returning id
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
				values (${tenantA}, ${contact!.id}, ${type.id}, 'clinic', 'open', '2026-08-20')
			`;
		});

		await expect(settingsService.deleteIncidentType(tenantA, type.id)).rejects.toBeInstanceOf(
			BadRequestException
		);

		// Confirm it is still there and unaffected.
		const stillThere = await settingsService.listIncidentTypes(tenantA, { area: 'clinic' });
		expect(stillThere.items.some((i) => i.id === type.id)).toBe(true);
	});

	it('throws not_found when deleting or renaming an unknown incident type', async () => {
		await expect(settingsService.deleteIncidentType(tenantA, randomUUID())).rejects.toThrow(
			NotFoundException
		);
		await expect(
			settingsService.updateIncidentType(tenantA, randomUUID(), { name: 'x' })
		).rejects.toThrow(NotFoundException);
	});

	it('isolates tenants: Tenant A cannot see, rename, or delete Tenant B incident types', async () => {
		const name = `Shared-${randomUUID().slice(0, 8)}`;
		const onA = await settingsService.createIncidentType(tenantA, { area: 'clinic', name });
		const onB = await settingsService.createIncidentType(tenantB, { area: 'clinic', name });
		expect(onA.name).toBe(name);
		expect(onB.name).toBe(name);

		const listA = await settingsService.listIncidentTypes(tenantA, { area: 'clinic' });
		expect(listA.items.some((i) => i.id === onB.id)).toBe(false);

		await expect(
			settingsService.updateIncidentType(tenantA, onB.id, { name: `${name}-hijack` })
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(settingsService.deleteIncidentType(tenantA, onB.id)).rejects.toBeInstanceOf(
			NotFoundException
		);

		const stillB = await settingsService.updateIncidentType(tenantB, onB.id, {
			name: `${name}-ok`
		});
		expect(stillB.name).toBe(`${name}-ok`);
	});
});
