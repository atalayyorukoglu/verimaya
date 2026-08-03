import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { TenantsService } from './tenants.service';

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

describe('tenants current (get/update)', () => {
	const tenantId = randomUUID();
	const otherTenantId = randomUUID();
	let tenantsService: TenantsService;
	const actor = { actorId: null, actorDisplayName: 'Test Actor' };

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantId}, 'Test Tenant', ${`tenant-${tenantId.slice(0, 8)}`}, now()),
				(${otherTenantId}, 'Other Tenant', ${`tenant-${otherTenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantId}, 'Test Tenant', ${`tenant-${tenantId.slice(0, 8)}`}),
				(${otherTenantId}, 'Other Tenant', ${`tenant-${otherTenantId.slice(0, 8)}`})
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		tenantsService = new TenantsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from tenants where id in (${tenantId}, ${otherTenantId})`;
		await sql`delete from organization where id in (${tenantId}, ${otherTenantId})`;
		await closeDb();
	});

	it('returns the tenant row matching the active organization', async () => {
		const tenant = await tenantsService.get(tenantId);

		expect(tenant.id).toBe(tenantId);
		expect(tenant.name).toBe('Test Tenant');
		expect(tenant.base_currency).toBe('TRY');
		expect(tenant.patients_section_label).toBe('Hastalar');
		expect(tenant.timezone).toBe('Europe/Istanbul');
	});

	it('updates name, base_currency, timezone and patients_section_label', async () => {
		const updated = await tenantsService.update(
			tenantId,
			{
				name: 'Renamed Tenant',
				base_currency: 'USD',
				patients_section_label: 'Misafirler',
				timezone: 'Asia/Riyadh'
			},
			actor
		);

		expect(updated.name).toBe('Renamed Tenant');
		expect(updated.base_currency).toBe('USD');
		expect(updated.patients_section_label).toBe('Misafirler');
		expect(updated.timezone).toBe('Asia/Riyadh');

		const reloaded = await tenantsService.get(tenantId);
		expect(reloaded.name).toBe('Renamed Tenant');
	});

	it('leaves untouched fields as-is on partial update', async () => {
		const updated = await tenantsService.update(tenantId, { base_currency: 'EUR' }, actor);

		expect(updated.name).toBe('Renamed Tenant');
		expect(updated.base_currency).toBe('EUR');
		expect(updated.patients_section_label).toBe('Misafirler');
	});

	it('does not leak or affect another tenant row', async () => {
		const other = await tenantsService.get(otherTenantId);
		expect(other.name).toBe('Other Tenant');
		expect(other.base_currency).toBe('TRY');
	});

	it('throws not_found for an unknown tenant id', async () => {
		await expect(tenantsService.get(randomUUID())).rejects.toThrow(NotFoundException);
	});
});
