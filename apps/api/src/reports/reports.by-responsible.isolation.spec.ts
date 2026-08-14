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

async function withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('reports by-responsible', () => {
	const tenantId = randomUUID();
	let personelId: string;
	let service: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Resp Rpt', ${`resp-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Resp Rpt', ${`resp-${tenantId.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Personel', 0) on conflict do nothing`;
			const [personel] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Personel' limit 1),
					'Personel', 'Ayşe', 'Ayşe Personel'
				) returning id
			`;
			personelId = personel!.id as string;

			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency,
					responsible_contact_id
				) values
					(${tenantId}, 'expense', 'Staff spend', '2026-03-01', 'paid', 5000, 5000, 5000, 'TRY', ${personelId}),
					(${tenantId}, 'expense', 'Unassigned spend', '2026-03-02', 'paid', 2000, 2000, 2000, 'TRY', null),
					(${tenantId}, 'income', 'Not an expense', '2026-03-03', 'paid', 9000, 9000, 9000, 'TRY', ${personelId})
			`;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(id, (db) => fn({ db }))
		} as TenantContextService;
		service = new ReportsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('groups expenses by responsible and buckets null as Atanmamış', async () => {
		const report = await service.byResponsible(tenantId, {
			from: '2026-03-01',
			to: '2026-03-31'
		});

		expect(report.items).toHaveLength(2);
		const assigned = report.items.find((r) => r.responsible_contact_id === personelId);
		const unassigned = report.items.find((r) => r.responsible_contact_id == null);
		expect(assigned?.expense_base).toBe(5000);
		expect(assigned?.transaction_count).toBe(1);
		expect(unassigned?.responsible_label).toBe('Atanmamış');
		expect(unassigned?.expense_base).toBe(2000);
		expect(unassigned?.transaction_count).toBe(1);
	});
});
