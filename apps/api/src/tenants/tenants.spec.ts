import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { INVALID_TIMEZONE_CODE, tenantUpdateSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { closeDb, getDb } from '../db/client';
import { parseBody } from '../common/mappers';
import type { TenantContextService } from '../tenant/tenant-context.service';
import { TenantsService } from './tenants.service';
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
		await purgeTenantFixtures(sql, [tenantId, otherTenantId]);
		await closeDb();
	});

	it('returns the tenant row matching the active organization', async () => {
		const tenant = await tenantsService.get(tenantId);

		expect(tenant.id).toBe(tenantId);
		expect(tenant.name).toBe('Test Tenant');
		expect(tenant.base_currency).toBe('TRY');
		expect(tenant.base_currency_locked).toBe(false);
		expect(tenant.contacts_section_label).toBe('Hastalar');
		expect(tenant.timezone).toBe('Europe/Istanbul');
	});

	it('updates name, base_currency, timezone and contacts_section_label when unlocked', async () => {
		const updated = await tenantsService.update(
			tenantId,
			{
				name: 'Renamed Tenant',
				base_currency: 'USD',
				contacts_section_label: 'Misafirler',
				timezone: 'Asia/Riyadh'
			},
			actor
		);

		expect(updated.name).toBe('Renamed Tenant');
		expect(updated.base_currency).toBe('USD');
		expect(updated.contacts_section_label).toBe('Misafirler');
		expect(updated.timezone).toBe('Asia/Riyadh');
		expect(updated.base_currency_locked).toBe(false);

		const reloaded = await tenantsService.get(tenantId);
		expect(reloaded.name).toBe('Renamed Tenant');
	});

	it('leaves untouched fields as-is on partial update', async () => {
		const updated = await tenantsService.update(tenantId, { base_currency: 'EUR' }, actor);

		expect(updated.name).toBe('Renamed Tenant');
		expect(updated.base_currency).toBe('EUR');
		expect(updated.contacts_section_label).toBe('Misafirler');
	});

	it('allows same base_currency PATCH after first transaction', async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantId, async () => {
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, currency
				) values (
					${tenantId}, 'income', 'Lock probe', '2026-01-01', 'paid', 1000, 'EUR'
				)
			`;
		});

		const same = await tenantsService.update(
			tenantId,
			{ base_currency: 'EUR', name: 'Still Eur' },
			actor
		);
		expect(same.base_currency).toBe('EUR');
		expect(same.name).toBe('Still Eur');
		expect(same.base_currency_locked).toBe(true);
	});

	it('returns 409 base_currency_locked when changing base after first transaction', async () => {
		try {
			await tenantsService.update(tenantId, { base_currency: 'GBP' }, actor);
			expect.unreachable('expected ConflictException');
		} catch (err) {
			expect(err).toBeInstanceOf(ConflictException);
			const body = (err as ConflictException).getResponse() as {
				error: { code: string };
			};
			expect(body.error.code).toBe('base_currency_locked');
		}

		const reloaded = await tenantsService.get(tenantId);
		expect(reloaded.base_currency).toBe('EUR');
		expect(reloaded.base_currency_locked).toBe(true);
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

describe('PATCH /v1/tenants/current timezone validation (AUDIT-F09-19)', () => {
	it('parseBody rejects non-IANA timezone with invalid_timezone', () => {
		const req = { id: 'audit-f09-19' } as FastifyRequest;
		try {
			parseBody(tenantUpdateSchema, { timezone: 'Not/A_Real_Zone' }, req);
			expect.unreachable('expected BadRequestException');
		} catch (err) {
			expect(err).toBeInstanceOf(BadRequestException);
			const body = (err as BadRequestException).getResponse() as {
				error: { code: string; message: string };
			};
			expect(body.error.code).toBe(INVALID_TIMEZONE_CODE);
			expect(body.error.message).toMatch(/IANA/i);
		}
	});

	it('parseBody accepts preset and extra valid IANA timezones', () => {
		const req = { id: 'audit-f09-19-ok' } as FastifyRequest;
		expect(parseBody(tenantUpdateSchema, { timezone: 'Europe/Istanbul' }, req).timezone).toBe(
			'Europe/Istanbul'
		);
		expect(parseBody(tenantUpdateSchema, { timezone: 'America/New_York' }, req).timezone).toBe(
			'America/New_York'
		);
	});
});
