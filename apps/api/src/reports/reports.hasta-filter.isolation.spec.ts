/**
 * E2' (DOMAIN-02): contactDistribution counts only contact_type_name = 'Hasta'.
 * Mixed cohort (3 Hasta + 2 Klinik + 1 Otel) → total = 3; source/medium breakout.
 * Tenant mock: drizzle transaction + SET LOCAL (is_local=true).
 */
import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe("E2' reports contactDistribution Hasta filter + source/medium", () => {
	const tenantId = randomUUID();
	let reports: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'E2prime', ${`e2p-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency, timezone)
			values (${tenantId}, 'E2prime', ${`e2p-${tenantId.slice(0, 8)}`}, 'TRY', 'Europe/Istanbul')
		`;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;
		reports = new ReportsService(tenantContext);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [hasta] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Hasta', 0) returning id
			`;
			const [klinik] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Klinik', 1) returning id
			`;
			const [otel] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Otel', 2) returning id
			`;
			await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name,
					first_name, display_name, status, source, medium
				) values
				(${tenantId}, ${hasta!.id}, 'Hasta', 'H1', 'H1', 'scheduled', 'Dijital Reklam', 'Meta Ads'),
				(${tenantId}, ${hasta!.id}, 'Hasta', 'H2', 'H2', 'treated', 'Dijital Reklam', 'Google Ads'),
				(${tenantId}, ${hasta!.id}, 'Hasta', 'H3', 'H3', 'arrived', 'Organik', null),
				(${tenantId}, ${klinik!.id}, 'Klinik', 'Klinik A', 'Klinik A', null, 'Dijital Reklam', 'Meta Ads'),
				(${tenantId}, ${klinik!.id}, 'Klinik', 'Klinik B', 'Klinik B', null, 'Referans', null),
				(${tenantId}, ${otel!.id}, 'Otel', 'Otel X', 'Otel X', null, 'Organik', null)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from contacts where tenant_id = ${tenantId}`;
			await tx`delete from contact_types where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('counts only Hasta (total=3) with source/medium breakout', async () => {
		const dist = await reports.contactDistribution(tenantId, {});
		expect(dist.total).toBe(3);

		const bySource = Object.fromEntries(dist.by_source.map((r) => [r.source, r.count]));
		expect(bySource['Dijital Reklam']).toBe(2);
		expect(bySource['Organik']).toBe(1);
		expect(dist.by_source.reduce((n, r) => n + r.count, 0)).toBe(3);

		const byMedium = Object.fromEntries(dist.by_medium.map((r) => [r.medium, r.count]));
		expect(byMedium['Meta Ads']).toBe(1);
		expect(byMedium['Google Ads']).toBe(1);
		expect(byMedium['Bilinmeyen']).toBe(1);
	});
});
