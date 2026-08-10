import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { ContactsService } from './contacts.service';

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

describe('patient finance summary tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let contactsService: ContactsService;

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

		patientA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Patient A', 'Patient A'
				)
				returning id
			`;
			return row!.id as string;
		});

		patientB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Patient B', 'Patient B'
				)
				returning id
			`;
			return row!.id as string;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					(${tenantA}, 'income', 'A income paid', '2026-01-10', 'paid', 10000, 10000, 10000, 'TRY', ${patientA}),
					(${tenantA}, 'income', 'A income partial', '2026-01-11', 'partial', 8000, 8000, 3000, 'TRY', ${patientA}),
					(${tenantA}, 'expense', 'A expense', '2026-01-12', 'paid', 2000, 2000, 2000, 'TRY', ${patientA})
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				)
				values
					(${tenantB}, 'income', 'B income', '2026-01-10', 'paid', 50000, 50000, 50000, 'TRY', ${patientB})
			`;
		});

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(tenantId, (db) => fn({ db }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantDb(tenantA, async (tdb) => {
			await tdb.execute(drizzleSql`delete from transactions where tenant_id = ${tenantA}`);
			await tdb.execute(drizzleSql`delete from contacts where tenant_id = ${tenantA}`);
		});
		await withTenantDb(tenantB, async (tdb) => {
			await tdb.execute(drizzleSql`delete from transactions where tenant_id = ${tenantB}`);
			await tdb.execute(drizzleSql`delete from contacts where tenant_id = ${tenantB}`);
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A finance summary excludes Tenant B patient transactions', async () => {
		const summary = await contactsService.financeSummary(tenantA, patientA);

		expect(summary.income_base).toBe(18000);
		expect(summary.expense_base).toBe(2000);
		expect(summary.net_base).toBe(16000);
		expect(summary.paid_base).toBe(13000);
		expect(summary.outstanding_base).toBe(5000);
		expect(summary.transaction_count).toBe(3);
	});

	it('Tenant A cannot read Tenant B patient finance summary', async () => {
		await expect(contactsService.financeSummary(tenantA, patientB)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it('Tenant B finance summary excludes Tenant A patient transactions', async () => {
		const summary = await contactsService.financeSummary(tenantB, patientB);

		expect(summary.income_base).toBe(50000);
		expect(summary.expense_base).toBe(0);
		expect(summary.net_base).toBe(50000);
		expect(summary.paid_base).toBe(50000);
		expect(summary.outstanding_base).toBe(0);
		expect(summary.transaction_count).toBe(1);
	});
});
