import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tx: ReturnType<typeof getDb>['sql']) => Promise<T>
): Promise<T> {
	const { sql } = getDb(databaseUrl);
	return sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
		return fn(tx);
	});
}

async function withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

function tenantContextMock(): TenantContextService {
	return {
		withTenant: async <T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
			withTenantDb(tenantId, (db) => fn({ db }))
	} as TenantContextService;
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
			insert into tenants (id, name, slug, base_currency)
			values
				(${tenantA}, 'Tenant A', ${`mkt-a-${tenantA.slice(0, 8)}`}, 'TRY'),
				(${tenantB}, 'Tenant B', ${`mkt-b-${tenantB.slice(0, 8)}`}, 'TRY')
		`;

		patientA = await withTenantSession(tenantA, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing`;
			});
			const [row] = await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				return tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta',
					'Patient A Meta',
					'Patient A Meta',
					'Meta Ads',
					'treated',
					timestamptz '2026-01-15 12:00:00+00'
				)
				returning id`;
			});
			return row!.id as string;
		});

		patientB = await withTenantSession(tenantB, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') on conflict do nothing`;
			});
			const [row] = await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
				return tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta',
					'Patient B Google',
					'Patient B Google',
					'Google Ads',
					'treated',
					timestamptz '2026-01-15 12:00:00+00'
				)
				returning id
			`;
			});
			return row!.id as string;
		});

		await withTenantSession(tenantA, async (tx) => {
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values
					(${tenantA}, 'meta', ${period.from}, 'camp-a', 100000, 'TRY', 1000, 50)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					-- Tracker model: paid + paid_amount NULL = fully paid (must count as tahsilat)
					(${tenantA}, 'income', 'A tahsilat', ${period.from}, 'paid', 300000, 300000, null, 'TRY', ${patientA})
			`;
		});

		await withTenantSession(tenantB, async (tx) => {
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values
					(${tenantB}, 'google', ${period.from}, 'camp-b', 999999, 'TRY', 9000, 900)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					(${tenantB}, 'income', 'B tahsilat', ${period.from}, 'paid', 888888, 888888, 888888, 'TRY', ${patientB})
			`;
		});

		reportsService = new ReportsService(tenantContextMock());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
	});

	it('Tenant A marketing report excludes Tenant B spend, revenue, and sources', async () => {
		const report = await reportsService.marketing(tenantA, period);

		expect(report.spend_fx_missing).toBe(false);
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

		expect(report.spend_fx_missing).toBe(false);
		expect(report.spend_base).toBe(999999);
		expect(report.revenue_base).toBe(888888);
		expect(report.by_source.map((r) => r.source)).toContain('Google Ads');
		expect(report.by_source.map((r) => r.source)).not.toContain('Meta Ads');
	});
});

describe('reports marketing ad spend FX (OPS-02c)', () => {
	const tenantGbp = randomUUID();
	const period = { from: '2026-04-01', to: '2026-08-01' };
	let reportsService: ReportsService;
	let patientId: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantGbp}, 'GBP Tenant', ${`mkt-gbp-${tenantGbp.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values (${tenantGbp}, 'GBP Tenant', ${`mkt-gbp-${tenantGbp.slice(0, 8)}`}, 'GBP')
		`;

		patientId = await withTenantSession(tenantGbp, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantGbp}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantGbp}, 'Hasta') on conflict do nothing`;
			});
			const [row] = await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantGbp}, true)`;
				return tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantGbp},
					(select id from contact_types where tenant_id = ${tenantGbp} and name = 'Hasta' limit 1),
					'Hasta',
					'Patient GBP',
					'Patient GBP',
					'Google Ads',
					'treated',
					timestamptz '2026-05-01 12:00:00+00'
				)
				returning id
			`;
			});
			return row!.id as string;
		});

		await withTenantSession(tenantGbp, async (tx) => {
			// TRY spend with FX snapshot → GBP (prod-shaped: Ads TRY, tenant GBP)
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id,
					spend_minor, currency, spend_base, base_currency, fx_rate, fx_dated,
					impressions, clicks
				)
				values
					(
						${tenantGbp}, 'google', '2026-05-10', 'camp-try',
						10000000, 'TRY', 158400, 'GBP', 0.01584, '2026-05-10',
						1000, 50
					)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					(${tenantGbp}, 'income', 'GBP tahsilat', '2026-05-15', 'paid', 3136320, 3136320, null, 'GBP', ${patientId})
			`;
		});

		reportsService = new ReportsService(tenantContextMock());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantGbp]);
	});

	it('TRY spend + GBP tenant uses spend_base for ROAS', async () => {
		const report = await reportsService.marketing(tenantGbp, period);

		expect(report.spend_fx_missing).toBe(false);
		expect(report.spend_base).toBe(158400);
		expect(report.revenue_base).toBe(3136320);
		expect(report.real_roas).toBeCloseTo(19.8, 1);
		expect(report.cost_per_lead).toBe(158400);
	});

	it('currency null spend is excluded and surfaces spend_fx_missing', async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantGbp, async (tx) => {
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id,
					spend_minor, currency, impressions, clicks
				)
				values
					(${tenantGbp}, 'google', '2026-06-01', 'camp-null-fx', 50000, null, 100, 10)
			`;
		});

		try {
			const report = await reportsService.marketing(tenantGbp, period);

			expect(report.spend_fx_missing).toBe(true);
			expect(report.spend_base).toBeNull();
			expect(report.real_roas).toBeNull();
			expect(report.cost_per_lead).toBeNull();
			expect(report.cost_per_treated).toBeNull();
			// Revenue still available — only spend-driven metrics are withheld
			expect(report.revenue_base).toBe(3136320);
		} finally {
			await withTenantSession(tenantGbp, async (tx) => {
				await tx`delete from ad_metrics_daily where campaign_id = 'camp-null-fx'`;
			});
		}
	});
});

describe('reports marketing effective window + attribution', () => {
	const tenantW = randomUUID();
	let reportsService: ReportsService;
	let patientKnown: string;
	let patientUnknown: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantW}, 'Window Tenant', ${`mkt-w-${tenantW.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values (${tenantW}, 'Window Tenant', ${`mkt-w-${tenantW.slice(0, 8)}`}, 'TRY')
		`;

		patientKnown = await withTenantSession(tenantW, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantW}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantW}, 'Hasta') on conflict do nothing`;
			});
			const [row] = await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantW}, true)`;
				return tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantW},
					(select id from contact_types where tenant_id = ${tenantW} and name = 'Hasta' limit 1),
					'Hasta',
					'Patient Known Source',
					'Patient Known Source',
					'Meta Ads',
					'treated',
					timestamptz '2026-02-15 12:00:00+00'
				)
				returning id
			`;
			});
			return row!.id as string;
		});

		patientUnknown = await withTenantSession(tenantW, async () => {
			const [row] = await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantW}, true)`;
				return tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantW},
					(select id from contact_types where tenant_id = ${tenantW} and name = 'Hasta' limit 1),
					'Hasta',
					'Patient Unknown Source',
					'Patient Unknown Source',
					null,
					'treated',
					timestamptz '2026-03-15 12:00:00+00'
				)
				returning id
			`;
			});
			return row!.id as string;
		});

		await withTenantSession(tenantW, async (tx) => {
			// Meta: narrow window Jan; Google: wide window spanning into June
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values
					(${tenantW}, 'meta', '2026-01-05', 'camp-meta-a', 50000, 'TRY', 500, 20),
					(${tenantW}, 'meta', '2026-01-20', 'camp-meta-b', 50000, 'TRY', 500, 20),
					(${tenantW}, 'google', '2026-02-01', 'camp-google-a', 80000, 'TRY', 800, 40),
					(${tenantW}, 'google', '2026-06-15', 'camp-google-b', 20000, 'TRY', 200, 10)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					-- Inside Meta window
					(${tenantW}, 'income', 'Jan tahsilat', '2026-01-10', 'paid', 200000, 200000, null, 'TRY', ${patientKnown}),
					-- Outside Meta window (would inflate all-time without effective window)
					(${tenantW}, 'income', 'May tahsilat', '2026-05-01', 'paid', 999000, 999000, null, 'TRY', ${patientKnown}),
					-- Unknown-source patient (for attribution_missing fixture, separate call period)
					(${tenantW}, 'income', 'Unknown tahsilat', '2026-03-20', 'paid', 150000, 150000, null, 'TRY', ${patientUnknown})
			`;
		});

		reportsService = new ReportsService(tenantContextMock());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantW]);
	});

	it('(a) all-time request: effective spend window equals tahsilat window (ad_metrics MIN/MAX)', async () => {
		const report = await reportsService.marketing(tenantW, {});

		expect(report.period.from).toBeNull();
		expect(report.period.to).toBeNull();
		// All providers: Meta Jan-05 .. Google Jun-15
		expect(report.period.effective_from).toBe('2026-01-05');
		expect(report.period.effective_to).toBe('2026-06-15');
		// May tahsilat falls inside all-provider window → included
		expect(report.revenue_base).toBe(200000 + 999000 + 150000);
		expect(report.spend_base).toBe(50000 + 50000 + 80000 + 20000);
	});

	it('(a2) provider=meta all-time: effective window is Meta MIN/MAX only; May tahsilat excluded', async () => {
		const report = await reportsService.marketing(tenantW, { provider: 'meta' });

		expect(report.period.effective_from).toBe('2026-01-05');
		expect(report.period.effective_to).toBe('2026-01-20');
		expect(report.spend_base).toBe(100000);
		// May 1 and Mar 20 sit outside Meta window
		expect(report.revenue_base).toBe(200000);
		// patientKnown created Feb 15, patientUnknown Mar 15 — both outside Meta Jan window
		expect(report.leads_count).toBe(0);
		expect(report.treated_count).toBe(0);
	});

	it('(a3) all-time: cohort excludes patients created before ad_metrics window; CPL uses window leads', async () => {
		const { sql } = getDb(databaseUrl);
		// Patient created before any ad_metrics date (2025) must not enter leads_count
		await withTenantSession(tenantW, async (tx) => {
			await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, source, status, created_at)
				values (
					${tenantW},
					(select id from contact_types where tenant_id = ${tenantW} and name = 'Hasta' limit 1),
					'Hasta',
					'Pre-window Patient',
					'Pre-window Patient',
					'Meta Ads',
					'treated',
					timestamptz '2025-06-01 12:00:00+00'
				)
			`;
			// Window has patientKnown + patientUnknown; attribution must clear the threshold
			// so CPL assertions stay about the window, not OPS-02d withholding.
			await tx`
				update contacts set source = 'Meta Ads' where id = ${patientUnknown}
			`;
		});

		try {
			const report = await reportsService.marketing(tenantW, {});
			// Window 2026-01-05..2026-06-15 → only patientKnown (Feb) + patientUnknown (Mar)
			expect(report.leads_count).toBe(2);
			expect(report.treated_count).toBe(2);
			expect(report.spend_base).toBe(200000);
			expect(report.attribution_missing).toBe(false);
			expect(report.attribution_coverage).toBe(1);
			// CPL = spend / window leads, not all-time headcount (would be 3 with pre-window)
			expect(report.cost_per_lead).toBe(100000);
		} finally {
			await withTenantSession(tenantW, async (tx) => {
				await tx`update contacts set source = null where id = ${patientUnknown}`;
				await tx`delete from contacts where tenant_id = ${tenantW} and display_name = 'Pre-window Patient'`;
			});
		}
	});

	it('(b) attribution_missing true → real_roas / CPL / CPT null', async () => {
		// Period covering only the unknown-source patient + invent spend in that month
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantW, async (tx) => {
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values (${tenantW}, 'meta', '2026-03-10', 'camp-meta-attr', 25000, 'TRY', 100, 5)
			`;
		});

		try {
			const report = await reportsService.marketing(tenantW, {
				from: '2026-03-01',
				to: '2026-03-31'
			});

			expect(report.by_source.length).toBeGreaterThan(0);
			expect(report.by_source.every((r) => r.source === 'Bilinmeyen')).toBe(true);
			expect(report.attribution_coverage).toBe(0);
			expect(report.attribution_missing).toBe(true);
			expect(report.spend_fx_missing).toBe(false);
			expect(report.spend_base).toBe(25000);
			expect(report.revenue_base).toBe(150000);
			expect(report.real_roas).toBeNull();
			expect(report.cost_per_lead).toBeNull();
			expect(report.cost_per_treated).toBeNull();
		} finally {
			await withTenantSession(tenantW, async (tx) => {
				await tx`delete from ad_metrics_daily where campaign_id = 'camp-meta-attr'`;
			});
		}
	});

	it('(b2) 1 of N attributed still below threshold → attribution_missing; ratio metrics null', async () => {
		// All-time window: patientKnown (Meta Ads) + patientUnknown (null) → coverage 0.5
		const report = await reportsService.marketing(tenantW, {});

		expect(report.leads_count).toBe(2);
		expect(report.attribution_coverage).toBe(0.5);
		expect(report.attribution_coverage!).toBeLessThan(0.8);
		expect(report.attribution_missing).toBe(true);
		expect(report.spend_fx_missing).toBe(false);
		expect(report.spend_base).toBeGreaterThan(0);
		expect(report.real_roas).toBeNull();
		expect(report.cost_per_lead).toBeNull();
		expect(report.cost_per_treated).toBeNull();
	});

	it('(b3) coverage at or above threshold → ROAS/CPL/CPT published', async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantW, async (tx) => {
			await tx`update contacts set source = 'Google Ads' where id = ${patientUnknown}`;
		});

		try {
			const report = await reportsService.marketing(tenantW, {});

			expect(report.leads_count).toBe(2);
			expect(report.attribution_coverage).toBe(1);
			expect(report.attribution_missing).toBe(false);
			expect(report.spend_fx_missing).toBe(false);
			expect(report.spend_base).toBe(200000);
			expect(report.real_roas).not.toBeNull();
			expect(report.cost_per_lead).toBe(100000);
			expect(report.cost_per_treated).toBe(100000);
		} finally {
			await withTenantSession(tenantW, async (tx) => {
				await tx`update contacts set source = null where id = ${patientUnknown}`;
			});
		}
	});

	it('empty by_source window → attribution_missing false and real_roas null', async () => {
		const report = await reportsService.marketing(tenantW, {
			from: '2025-01-01',
			to: '2025-01-31'
		});

		expect(report.by_source).toEqual([]);
		expect(report.attribution_coverage).toBeNull();
		expect(report.attribution_missing).toBe(false);
		expect(report.revenue_base).toBe(0);
		expect(report.leads_count).toBe(0);
		expect(report.treated_count).toBe(0);
		expect(report.spend_base).toBe(0);
		expect(report.real_roas).toBeNull();
		expect(report.cost_per_lead).toBeNull();
		expect(report.cost_per_treated).toBeNull();
	});
});

afterAll(async () => {
	await closeDb();
});
