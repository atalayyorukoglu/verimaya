import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

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

describe('reports marketing tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const period = { from: '2026-01-01', to: '2026-01-31' };
	let reportsService: ReportsService;
	let patientA: string;
	let patientB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`mkt-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`mkt-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`mkt-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`mkt-b-${tenantB.slice(0, 8)}`})
		`;

		patientA = await withTenantSession(tenantA, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name, source, status, created_at)
				values (
					${tenantA},
					'Patient A Meta',
					'Meta Ads',
					'treated',
					timestamptz '2026-01-15 12:00:00+00'
				)
				returning id
			`;
			return row!.id as string;
		});

		patientB = await withTenantSession(tenantB, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name, source, status, created_at)
				values (
					${tenantB},
					'Patient B Google',
					'Google Ads',
					'treated',
					timestamptz '2026-01-15 12:00:00+00'
				)
				returning id
			`;
			return row!.id as string;
		});

		await withTenantSession(tenantA, async () => {
			await sql`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, impressions, clicks
				)
				values
					(${tenantA}, 'meta', ${period.from}, 'camp-a', 100000, 1000, 50)
			`;
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, patient_id
				)
				values
					-- Tracker model: paid + paid_amount NULL = fully paid (must count as tahsilat)
					(${tenantA}, 'income', 'A tahsilat', ${period.from}, 'paid', 300000, 300000, null, 'TRY', ${patientA})
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, impressions, clicks
				)
				values
					(${tenantB}, 'google', ${period.from}, 'camp-b', 999999, 9000, 900)
			`;
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, patient_id
				)
				values
					(${tenantB}, 'income', 'B tahsilat', ${period.from}, 'paid', 888888, 888888, 888888, 'TRY', ${patientB})
			`;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		reportsService = new ReportsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from transactions where tenant_id = ${tenantA}`;
			await sql`delete from ad_metrics_daily where tenant_id = ${tenantA}`;
			await sql`delete from patients where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from transactions where tenant_id = ${tenantB}`;
			await sql`delete from ad_metrics_daily where tenant_id = ${tenantB}`;
			await sql`delete from patients where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A marketing report excludes Tenant B spend, revenue, and sources', async () => {
		const report = await reportsService.marketing(tenantA, period);

		expect(report.spend_base).toBe(100000);
		expect(report.revenue_base).toBe(300000);
		expect(report.leads_count).toBe(1);
		expect(report.treated_count).toBe(1);
		expect(report.real_roas).toBeCloseTo(3);
		expect(report.by_source.map((r) => r.source)).toContain('Meta Ads');
		expect(report.by_source.map((r) => r.source)).not.toContain('Google Ads');
		expect(report.spend_base).not.toBe(999999);
		expect(report.revenue_base).not.toBe(888888);
	});

	it('Tenant B marketing report excludes Tenant A spend and Meta Ads source', async () => {
		const report = await reportsService.marketing(tenantB, period);

		expect(report.spend_base).toBe(999999);
		expect(report.revenue_base).toBe(888888);
		expect(report.by_source.map((r) => r.source)).toContain('Google Ads');
		expect(report.by_source.map((r) => r.source)).not.toContain('Meta Ads');
	});
});
