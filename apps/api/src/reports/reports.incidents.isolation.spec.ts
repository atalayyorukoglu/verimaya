import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * `GET /v1/reports/incidents` (AI-05 girdisi). Kanıtlanan iddialar:
 *
 *  1. Alan/tür/sorumlu kırılımında sayı doğru — açık/çözüldü ayrımı dahil.
 *  2. Dönem sınırı `occurred_on` üzerinden çalışır (from/to inclusive).
 *  3. `includeCost=false` → cevapta `cost_totals` hiç yok (izin kararı burada
 *     denenmiyor — o ReportsController'da; burada yalnız servisin bayrağa uyduğu
 *     kanıtlanıyor). `includeCost=true` → para birimi bazında doğru toplam.
 *  4. Tenant izolasyonu — Tenant B'nin sayıları Tenant A'yı hiç görmez.
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

describe('reports incidents', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let reportsService: ReportsService;

	let contactA: string;
	let clinicA: string;
	let typeRevision: string;
	let typeComplication: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (db) => fn({ db }))
		} as TenantContextService;
		reportsService = new ReportsService(tenantContext);

		for (const [tenantId, name] of [
			[tenantA, 'Incidents Rpt A'],
			[tenantB, 'Incidents Rpt B']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`irpt-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${tenantId}, ${name}, ${`irpt-${tenantId.slice(0, 8)}`})
			`;
		}

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			const [patient] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${ct!.id}, 'Hasta', 'A', 'Hasta A')
				returning id
			`;
			contactA = patient!.id as string;
			const [clinic] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${ct!.id}, 'Hasta', 'Klinik', 'Ada Klinik')
				returning id
			`;
			clinicA = clinic!.id as string;

			const [t1] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantA}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			typeRevision = t1!.id as string;
			const [t2] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantA}, 'clinic', 'Komplikasyon', 1)
				returning id
			`;
			typeComplication = t2!.id as string;

			// Dönem içi: 2 açık revizyon (biri maliyetli TRY, biri maliyetsiz), 1 çözülmüş
			// komplikasyon (maliyetli GBP). Dönem dışı: 1 revizyon (hiç sayılmamalı).
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, responsible_contact_id, status, occurred_on, cost_amount, cost_currency)
				values (${tenantA}, ${contactA}, ${typeRevision}, 'clinic', ${clinicA}, 'open', '2026-08-10', 20000, 'TRY')
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, responsible_contact_id, status, occurred_on)
				values (${tenantA}, ${contactA}, ${typeRevision}, 'clinic', ${clinicA}, 'open', '2026-08-12')
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, responsible_contact_id, status, occurred_on, resolved_at, cost_amount, cost_currency)
				values (${tenantA}, ${contactA}, ${typeComplication}, 'clinic', ${clinicA}, 'resolved', '2026-08-15', now(), 5000, 'GBP')
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
				values (${tenantA}, ${contactA}, ${typeRevision}, 'clinic', 'open', '2026-07-01')
			`;
			// Soft-deleted — hiç sayılmamalı.
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on, deleted_at)
				values (${tenantA}, ${contactA}, ${typeRevision}, 'clinic', 'open', '2026-08-11', now())
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [ct] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				returning id
			`;
			const [patient] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantB}, ${ct!.id}, 'Hasta', 'B', 'Hasta B')
				returning id
			`;
			const [type] = await tx`
				insert into incident_types (tenant_id, area, name, sort_order)
				values (${tenantB}, 'clinic', 'Revizyon gerekti', 0)
				returning id
			`;
			await tx`
				insert into incidents (tenant_id, contact_id, incident_type_id, area, status, occurred_on)
				values (${tenantB}, ${patient!.id}, ${type!.id}, 'clinic', 'open', '2026-08-10')
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('counts by area/type/responsible correctly, excludes soft-deleted and out-of-period rows', async () => {
		const report = await reportsService.incidents(
			tenantA,
			{ from: '2026-08-01', to: '2026-08-31' },
			false
		);

		expect(report.total.count).toBe(3);
		expect(report.total.open_count).toBe(2);
		expect(report.total.resolved_count).toBe(1);
		expect(report.total).not.toHaveProperty('cost_totals');

		const clinicArea = report.by_area.find((a) => a.area === 'clinic');
		expect(clinicArea).toBeDefined();
		expect(clinicArea?.count).toBe(3);
		expect(clinicArea?.cost_totals).toBeUndefined();

		const revisionType = report.by_type.find((t) => t.incident_type_id === typeRevision);
		expect(revisionType?.count).toBe(2);
		expect(revisionType?.open_count).toBe(2);
		expect(revisionType?.incident_type_name).toBe('Revizyon gerekti');

		const complicationType = report.by_type.find((t) => t.incident_type_id === typeComplication);
		expect(complicationType?.count).toBe(1);
		expect(complicationType?.resolved_count).toBe(1);

		const responsibleRow = report.by_responsible.find(
			(r) => r.responsible_contact_id === clinicA
		);
		expect(responsibleRow?.count).toBe(3);
		expect(responsibleRow?.responsible_display_name).toBe('Ada Klinik');
	});

	it('honours the period boundary on occurred_on (2026-07-01 excluded when from=2026-08-01)', async () => {
		const unbounded = await reportsService.incidents(tenantA, {}, false);
		expect(unbounded.total.count).toBe(4); // 3 within Aug + 1 in July (deleted one still excluded)

		const bounded = await reportsService.incidents(
			tenantA,
			{ from: '2026-08-01', to: '2026-08-31' },
			false
		);
		expect(bounded.total.count).toBe(3);
	});

	it('includeCost=true sums cost per currency; includeCost=false omits cost_totals entirely', async () => {
		const withCost = await reportsService.incidents(
			tenantA,
			{ from: '2026-08-01', to: '2026-08-31' },
			true
		);
		expect(withCost.total.cost_totals).toEqual(
			expect.arrayContaining([
				{ currency: 'TRY', amount: 20000 },
				{ currency: 'GBP', amount: 5000 }
			])
		);
		expect(withCost.total.cost_totals).toHaveLength(2);

		const revisionType = withCost.by_type.find((t) => t.incident_type_id === typeRevision);
		expect(revisionType?.cost_totals).toEqual([{ currency: 'TRY', amount: 20000 }]);

		const withoutCost = await reportsService.incidents(
			tenantA,
			{ from: '2026-08-01', to: '2026-08-31' },
			false
		);
		expect(withoutCost.total).not.toHaveProperty('cost_totals');
		expect(withoutCost.by_type.every((t) => !('cost_totals' in t))).toBe(true);
	});

	it('tenant isolation: Tenant B counts never include Tenant A incidents', async () => {
		const reportB = await reportsService.incidents(tenantB, {}, false);
		expect(reportB.total.count).toBe(1);
		expect(reportB.by_type.some((t) => t.incident_type_id === typeRevision)).toBe(false);
		expect(reportB.by_responsible.some((r) => r.responsible_contact_id === clinicA)).toBe(false);
	});
});
