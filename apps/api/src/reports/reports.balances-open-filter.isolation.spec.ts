import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * balances() must list contacts with open_amount !== 0 only.
 * Fully collected / closed rows (open 0, collected ≠ 0) must not appear.
 */
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

describe('reports balances open_amount filter', () => {
	const tenantId = randomUUID();
	const contactOpen = randomUUID();
	const contactClosed = randomUUID();
	let contactTypeId = '';
	let reportsService: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Balances Open Filter', ${`bal-open-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Balances Open Filter', ${`bal-open-${tenantId.slice(0, 8)}`})
		`;

		await withTenantSession(tenantId, async () => {
			const [typeRow] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantId}, 'Klinik') returning id
			`;
			contactTypeId = typeRow!.id as string;
			await sql`
				insert into contacts (id, tenant_id, contact_type_id, contact_type_name, display_name)
				values
					(${contactOpen}, ${tenantId}, ${contactTypeId}, 'Klinik', 'Open Balance Contact'),
					(${contactClosed}, ${tenantId}, ${contactTypeId}, 'Klinik', 'Closed Balance Contact')
			`;
			await sql`
				insert into transactions (
					tenant_id, kind, title, category, subtitle, occurred_on, status,
					amount, amount_base, paid_amount, currency, contact_id, contact_label
				)
				values
					(
						${tenantId}, 'income', 'Still open', 'Saç Ekimi', 'Konsültasyon', '2026-02-01',
						'partial', 10000, 10000, 4000, 'TRY', ${contactOpen}, 'Open Balance Contact'
					),
					(
						${tenantId}, 'income', 'Fully paid', 'Saç Ekimi', 'Konsültasyon', '2026-02-01',
						'paid', 7000, 7000, 7000, 'TRY', ${contactClosed}, 'Closed Balance Contact'
					)
			`;
		});

		const tenantContext = {
			withTenant: async <T>(
				id: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;

		reportsService = new ReportsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('excludes contacts with zero open_amount even when collected_amount is non-zero', async () => {
		const report = await reportsService.balances(tenantId);
		const ids = report.items.map((row) => row.contact_id);

		expect(ids).toContain(contactOpen);
		expect(ids).not.toContain(contactClosed);

		const openRow = report.items.find((row) => row.contact_id === contactOpen);
		expect(openRow?.open_amount).toBe(6000);
		expect(openRow?.collected_amount).toBe(4000);
	});
});
