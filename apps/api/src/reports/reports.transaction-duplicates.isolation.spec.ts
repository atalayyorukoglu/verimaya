import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { reportTransactionDuplicatesParams } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { parseQuery } from '../common/mappers';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

/**
 * GAP-F09-14: server-side transaction duplicate scan — full-period GROUP BY,
 * soft-delete exclusion, from/to narrowing, tenant isolation.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('GAP-F09-14: reports transaction-duplicates', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const patientA = randomUUID();

	const ids = {
		dupA1: randomUUID(),
		dupA2: randomUUID(),
		dupSoft: randomUUID(),
		uniqueNew: randomUUID(),
		tenantBDup1: randomUUID(),
		tenantBDup2: randomUUID(),
		outOfRange1: randomUUID(),
		outOfRange2: randomUUID()
	};

	/** 100 unique fillers (newest dates) so a client `limit=100` page would miss the older dupes. */
	const fillerIds = Array.from({ length: 100 }, () => randomUUID());

	let service: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				db.transaction(async (tx) => {
					await tx.execute(
						drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`
					);
					return fn({ db: tx as TenantDb });
				})
		} as TenantContextService;

		service = new ReportsService(tenantContext);

		for (const [tenantId, name] of [
			[tenantA, 'GapF09-14 A'],
			[tenantB, 'GapF09-14 B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`g14-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency)
				values (${tenantId}, ${name}, ${`g14-${tenantId.slice(0, 8)}`}, 'TRY')
			`;
		}

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into patients (id, tenant_id, full_name, status, created_at, updated_at)
				values (${patientA}, ${tenantA}, 'G14 Patient', 'scheduled', now(), now())
			`;

			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.dupA1}, ${tenantA}, 'income', 'Dup A alpha', 'Operasyon', '2026-04-01', 'paid',
					99900, 99900, 'TRY', 99900, 'TRY', ${patientA}
				)
			`;
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.dupA2}, ${tenantA}, 'income', 'Dup A beta', 'Operasyon', '2026-04-01', 'paid',
					99900, 99900, 'TRY', 99900, 'TRY', ${patientA}
				)
			`;
			// Soft-deleted third copy — must not inflate the group (still count=2)
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id, deleted_at
				) values (
					${ids.dupSoft}, ${tenantA}, 'income', 'Dup A soft', 'Operasyon', '2026-04-01', 'paid',
					99900, 99900, 'TRY', 99900, 'TRY', ${patientA}, now()
				)
			`;

			// Outside May window — duplicate pair for from/to narrowing
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.outOfRange1}, ${tenantA}, 'expense', 'Out range 1', 'Konaklama', '2026-03-15', 'paid',
					5500, 5500, 'TRY', 5500, 'TRY', null
				)
			`;
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.outOfRange2}, ${tenantA}, 'expense', 'Out range 2', 'Konaklama', '2026-03-15', 'paid',
					5500, 5500, 'TRY', 5500, 'TRY', null
				)
			`;

			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.uniqueNew}, ${tenantA}, 'income', 'Unique newer', 'Operasyon', '2026-05-20', 'paid',
					1000, 1000, 'TRY', 1000, 'TRY', ${patientA}
				)
			`;

			for (let i = 0; i < fillerIds.length; i++) {
				const id = fillerIds[i]!;
				const day = String((i % 28) + 1).padStart(2, '0');
				await tx`
					insert into transactions (
						id, tenant_id, kind, title, category, occurred_on, status,
						amount, paid_amount, currency, amount_base, base_currency, patient_id
					) values (
						${id}, ${tenantA}, 'income', ${`Filler ${i}`}, 'Operasyon', ${`2026-05-${day}`}, 'paid',
						${10000 + i}, ${10000 + i}, 'TRY', ${10000 + i}, 'TRY', ${patientA}
					)
				`;
			}
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency
				) values (
					${ids.tenantBDup1}, ${tenantB}, 'income', 'B dup 1', 'Operasyon', '2026-04-01', 'paid',
					99900, 99900, 'TRY', 99900, 'TRY'
				)
			`;
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency
				) values (
					${ids.tenantBDup2}, ${tenantB}, 'income', 'B dup 2', 'Operasyon', '2026-04-01', 'paid',
					99900, 99900, 'TRY', 99900, 'TRY'
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from transactions where tenant_id = ${tenantId}`;
				await tx`delete from patients where tenant_id = ${tenantId}`;
			});
			await sql`delete from tenants where id = ${tenantId}`;
			await sql`delete from organization where id = ${tenantId}`;
		}
		await closeDb();
	});

	it('finds duplicate groups beyond a 100-row client page window', async () => {
		const report = await service.transactionDuplicates(tenantA, {
			from: '2026-04-01',
			to: '2026-05-31'
		});
		const hit = report.items.find(
			(g) =>
				g.amount === 99900 &&
				g.currency === 'TRY' &&
				g.occurred_on === '2026-04-01' &&
				g.kind === 'income'
		);
		expect(hit).toBeDefined();
		expect(hit?.count).toBe(2);
		expect(hit?.title).toMatch(/^Dup A /);
		expect(report.total_groups).toBeGreaterThanOrEqual(1);
	});

	it('excludes soft-deleted rows from duplicate groups', async () => {
		const report = await service.transactionDuplicates(tenantA, {
			from: '2026-04-01',
			to: '2026-05-31'
		});
		const hit = report.items.find(
			(g) => g.amount === 99900 && g.occurred_on === '2026-04-01' && g.kind === 'income'
		);
		expect(hit?.count).toBe(2);
	});

	it('narrows by from/to on occurred_on', async () => {
		const mayOnly = await service.transactionDuplicates(tenantA, {
			from: '2026-05-01',
			to: '2026-05-31'
		});
		expect(
			mayOnly.items.find((g) => g.amount === 99900 && g.occurred_on === '2026-04-01')
		).toBeUndefined();
		expect(
			mayOnly.items.find((g) => g.amount === 5500 && g.occurred_on === '2026-03-15')
		).toBeUndefined();

		const march = await service.transactionDuplicates(tenantA, {
			from: '2026-03-01',
			to: '2026-03-31'
		});
		const out = march.items.find(
			(g) => g.amount === 5500 && g.occurred_on === '2026-03-15' && g.kind === 'expense'
		);
		expect(out?.count).toBe(2);
	});

	it('does not leak Tenant B groups into Tenant A', async () => {
		const reportA = await service.transactionDuplicates(tenantA, {
			from: '2026-04-01',
			to: '2026-04-30'
		});
		const reportB = await service.transactionDuplicates(tenantB, {
			from: '2026-04-01',
			to: '2026-04-30'
		});
		expect(reportB.total_groups).toBe(1);
		expect(reportB.items[0]?.count).toBe(2);
		// Same key exists in A, but A must not see B's rows as a separate leak —
		// prove B sees exactly one group and A still sees its own without elevating count.
		const aDup = reportA.items.find(
			(g) => g.amount === 99900 && g.occurred_on === '2026-04-01' && g.kind === 'income'
		);
		expect(aDup?.count).toBe(2);
	});

	it('rejects undefined query params with 400 (parseQuery + .strict)', () => {
		const req = { id: 'test-request-id' } as Parameters<typeof parseQuery>[2];
		expect(() =>
			parseQuery(reportTransactionDuplicatesParams, { not_a_real_filter: '1' }, req)
		).toThrow();
	});
});
