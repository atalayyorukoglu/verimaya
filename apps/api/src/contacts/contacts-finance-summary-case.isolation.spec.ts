import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { ContactsService } from './contacts.service';
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

describe('financeSummary includes case_contact_id (OR, no double count)', () => {
	const tenantId = randomUUID();
	let patientId: string;
	let hotelId: string;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Case OR', ${`case-or-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Case OR', ${`case-or-${tenantId.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values
				(${tenantId}, 'Hasta', 0),
				(${tenantId}, 'Otel', 1)
				on conflict (tenant_id, name) do nothing`;
			const [patient] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
					'Hasta', 'Patient', 'Patient Case'
				) returning id
			`;
			const [hotel] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Otel' limit 1),
					'Otel', 'Hotel', 'Demo Hotel'
				) returning id
			`;
			patientId = patient!.id as string;
			hotelId = hotel!.id as string;

			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values (
					${tenantId}, 'income', 'Patient income', '2026-02-01', 'paid', 10000, 10000, 10000, 'TRY', ${patientId}
				)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency,
					contact_id, case_contact_id
				) values (
					${tenantId}, 'expense', 'Hotel for patient', '2026-02-02', 'paid', 3000, 3000, 3000, 'TRY',
					${hotelId}, ${patientId}
				)
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency,
					contact_id, case_contact_id
				) values (
					${tenantId}, 'expense', 'Both fields', '2026-02-03', 'paid', 1000, 1000, 1000, 'TRY',
					${patientId}, ${patientId}
				)
			`;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(id, (db) => fn({ db }))
		} as TenantContextService;
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('sums contact_id OR case_contact_id and counts dual-match row once', async () => {
		const summary = await contactsService.financeSummary(tenantId, patientId);

		expect(summary.transaction_count).toBe(3);
		expect(summary.income_base).toBe(10000);
		expect(summary.expense_base).toBe(4000);
		expect(summary.net_base).toBe(6000);
	});
});
