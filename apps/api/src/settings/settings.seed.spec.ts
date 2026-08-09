import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	DEFAULT_APPOINTMENT_TYPE_NAMES,
	DEFAULT_CONTACT_TYPE_NAMES,
	DEFAULT_FINANCE_CATEGORY_SEEDS
} from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { CryptoService } from '../common/crypto.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { defaultAppointmentTypeId } from './appointment-type-defaults';
import { SettingsService } from './settings.service';

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

describe('settings default seed', () => {
	const tenantId = randomUUID();
	let settingsService: SettingsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db } = getDb(databaseUrl);
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Seed Tenant', ${`seed-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Seed Tenant', ${`seed-${tenantId.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		settingsService = new SettingsService(tenantContext, {} as CryptoService);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantId, async () => {
			await sql`delete from finance_categories where tenant_id = ${tenantId}`;
			await sql`delete from contact_types where tenant_id = ${tenantId}`;
			await sql`delete from appointment_types where tenant_id = ${tenantId}`;
			await sql`delete from tenant_settings where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('seeds default contact types when tenant has none', async () => {
		const result = await settingsService.listContactTypes(tenantId);

		expect(result.items).toHaveLength(DEFAULT_CONTACT_TYPE_NAMES.length);
		expect(result.items.map((t) => t.name)).toEqual([...DEFAULT_CONTACT_TYPE_NAMES]);
	});

	it('seeds default finance categories when tenant has none', async () => {
		const result = await settingsService.listFinanceCategories(tenantId);

		expect(result.items).toHaveLength(DEFAULT_FINANCE_CATEGORY_SEEDS.length);
		expect(result.items.map((c) => `${c.kind}:${c.name}`)).toEqual(
			DEFAULT_FINANCE_CATEGORY_SEEDS.map((s) => `${s.kind}:${s.name}`)
		);
	});

	it('does not re-seed contact types when rows already exist', async () => {
		const first = await settingsService.listContactTypes(tenantId);
		const second = await settingsService.listContactTypes(tenantId);

		expect(second.items).toHaveLength(first.items.length);
		expect(second.items.map((t) => t.id)).toEqual(first.items.map((t) => t.id));
	});

	it('seeds default appointment types with deterministic IDs when tenant has none', async () => {
		const result = await settingsService.listAppointmentTypes(tenantId);

		expect(result.items).toHaveLength(DEFAULT_APPOINTMENT_TYPE_NAMES.length);
		expect(result.items.map((t) => t.name)).toEqual([...DEFAULT_APPOINTMENT_TYPE_NAMES]);
		for (const item of result.items) {
			expect(item.id).toBe(defaultAppointmentTypeId(tenantId, item.name));
		}
	});
});
