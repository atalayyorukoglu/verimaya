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

describe('reports summary tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const period = { from: '2026-01-01', to: '2026-01-31' };
	let reportsService: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		await withTenantSession(tenantA, async () => {
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, currency
				)
				values
					(${tenantA}, 'income', 'Tenant A income', ${period.from}, 'paid', 10000, 10000, 'TRY'),
					(${tenantA}, 'expense', 'Tenant A expense', ${period.from}, 'paid', 3000, 3000, 'TRY')
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, currency
				)
				values
					(${tenantB}, 'income', 'Tenant B income', ${period.from}, 'paid', 50000, 50000, 'TRY')
			`;
		});

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		reportsService = new ReportsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from transactions where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from transactions where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A summary excludes Tenant B transactions', async () => {
		const summary = await reportsService.summary(tenantA, period);

		expect(summary.income_base).toBe(10000);
		expect(summary.expense_base).toBe(3000);
		expect(summary.net_base).toBe(7000);
		expect(summary.transaction_count).toBe(2);
	});

	it('Tenant B summary excludes Tenant A transactions', async () => {
		const summary = await reportsService.summary(tenantB, period);

		expect(summary.income_base).toBe(50000);
		expect(summary.expense_base).toBe(0);
		expect(summary.net_base).toBe(50000);
		expect(summary.transaction_count).toBe(1);
	});
});
