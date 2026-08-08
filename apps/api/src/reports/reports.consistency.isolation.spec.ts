import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';

/**
 * GAP-05: server-side transaction consistency — tenant isolation, each of the five
 * rules (pos/neg), and detection beyond a client page size (100).
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

describe('GAP-05: reports consistency', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const patientA = randomUUID();
	const contactTypeA = randomUUID();
	const contactA = randomUUID();

	const ids = {
		cleanIncome: randomUUID(),
		cleanExpense: randomUUID(),
		paidNullOk: randomUUID(),
		unpaidZeroOk: randomUUID(),
		partialOk: randomUUID(),
		categoryMissing: randomUUID(),
		incomeNoPatient: randomUUID(),
		expenseNoContact: randomUUID(),
		fxMissing: randomUUID(),
		paidMismatch: randomUUID(),
		unpaidWithPay: randomUUID(),
		partialInvalid: randomUUID(),
		softDeletedBad: randomUUID(),
		tenantBBad: randomUUID(),
		needleAfterPage: randomUUID()
	};

	let service: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);
		service = new ReportsService(
			new TenantContextService({
				client: db,
				sql
			} as unknown as never)
		);

		for (const [tenantId, name] of [
			[tenantA, 'Gap05 A'],
			[tenantB, 'Gap05 B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`gap05-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency)
				values (${tenantId}, ${name}, ${`gap05-${tenantId.slice(0, 8)}`}, 'TRY')
			`;
		}

		await withTenantSession(tenantA, async () => {
			await sql`
				insert into patients (id, tenant_id, full_name, status, created_at, updated_at)
				values (${patientA}, ${tenantA}, 'Gap05 Patient', 'scheduled', now(), now())
			`;
			await sql`
				insert into contact_types (id, tenant_id, name, created_at)
				values (${contactTypeA}, ${tenantA}, 'Klinik', now())
			`;
			await sql`
				insert into contacts (
					id, tenant_id, contact_type_id, contact_type_name, display_name, created_at, updated_at
				) values (
					${contactA}, ${tenantA}, ${contactTypeA}, 'Klinik', 'Klinik Alfa', now(), now()
				)
			`;

			// Negatives (clean) — no issues
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency,
					patient_id, contact_id, contact_label
				) values (
					${ids.cleanIncome}, ${tenantA}, 'income', 'Clean income', 'Operasyon', '2026-05-01', 'paid',
					10000, 10000, 'TRY', 10000, 'TRY',
					${patientA}, null, null
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency,
					patient_id, contact_id, contact_label
				) values (
					${ids.cleanExpense}, ${tenantA}, 'expense', 'Clean expense', 'Konaklama', '2026-05-01', 'paid',
					5000, 5000, 'TRY', 5000, 'TRY',
					null, ${contactA}, 'Klinik Alfa'
				)
			`;
			// Tracker model: paid + paid_amount NULL = fully paid (OK)
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.paidNullOk}, ${tenantA}, 'income', 'Paid null OK', 'Operasyon', '2026-05-01', 'paid',
					1100, null, 'TRY', 1100, 'TRY', ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.unpaidZeroOk}, ${tenantA}, 'income', 'Unpaid zero OK', 'Operasyon', '2026-05-01', 'unpaid',
					1200, 0, 'TRY', 1200, 'TRY', ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.partialOk}, ${tenantA}, 'income', 'Partial OK', 'Operasyon', '2026-05-01', 'partial',
					1300, 500, 'TRY', 1300, 'TRY', ${patientA}
				)
			`;

			// Rule positives
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.categoryMissing}, ${tenantA}, 'income', 'No category', null, '2026-05-02', 'paid',
					1000, 1000, 'TRY', 1000, 'TRY', ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.incomeNoPatient}, ${tenantA}, 'income', 'Income orphan', 'Operasyon', '2026-05-03', 'paid',
					2000, 2000, 'TRY', 2000, 'TRY', null
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency,
					contact_id, contact_label
				) values (
					${ids.expenseNoContact}, ${tenantA}, 'expense', 'Expense orphan', 'Transfer', '2026-05-04', 'paid',
					3000, 3000, 'TRY', 3000, 'TRY',
					null, null
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.fxMissing}, ${tenantA}, 'income', 'FX missing', 'Operasyon', '2026-05-05', 'paid',
					4000, 4000, 'EUR', null, null, ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.paidMismatch}, ${tenantA}, 'income', 'Paid mismatch', 'Operasyon', '2026-05-06', 'paid',
					5000, 1000, 'TRY', 5000, 'TRY', ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.unpaidWithPay}, ${tenantA}, 'income', 'Unpaid with pay', 'Operasyon', '2026-05-07', 'unpaid',
					6000, 100, 'TRY', 6000, 'TRY', ${patientA}
				)
			`;
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.partialInvalid}, ${tenantA}, 'income', 'Partial bad', 'Operasyon', '2026-05-08', 'partial',
					7000, 0, 'TRY', 7000, 'TRY', ${patientA}
				)
			`;
			// Soft-deleted violation must be excluded
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id, deleted_at
				) values (
					${ids.softDeletedBad}, ${tenantA}, 'income', 'Deleted bad', null, '2026-05-09', 'paid',
					8000, 8000, 'TRY', 8000, 'TRY', ${patientA}, now()
				)
			`;

			// 120 clean rows so a client limit=100 page would miss a later needle
			for (let i = 0; i < 120; i++) {
				await sql`
					insert into transactions (
						tenant_id, kind, title, category, occurred_on, status,
						amount, paid_amount, currency, amount_base, base_currency, patient_id
					) values (
						${tenantA}, 'income', ${`Bulk ${i}`}, 'Operasyon', '2026-05-10', 'paid',
						100, 100, 'TRY', 100, 'TRY', ${patientA}
					)
				`;
			}
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, patient_id
				) values (
					${ids.needleAfterPage}, ${tenantA}, 'income', 'Needle after page', '', '2026-05-11', 'paid',
					9000, 9000, 'TRY', 9000, 'TRY', ${patientA}
				)
			`;
		});

		await withTenantSession(tenantB, async () => {
			await sql`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency
				) values (
					${ids.tenantBBad}, ${tenantB}, 'income', 'Tenant B orphan', 'Operasyon', '2026-05-03', 'paid',
					2000, 2000, 'TRY', 2000, 'TRY'
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
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
				await tx`delete from patients where tenant_id = ${tenantId}`;
			});
			await sql`delete from tenants where id = ${tenantId}`;
			await sql`delete from organization where id = ${tenantId}`;
		}
		await closeDb();
	});

	const period = { from: '2026-05-01', to: '2026-05-31' };

	it('flags each rule once and skips soft-deleted + clean rows', async () => {
		const report = await service.consistency(tenantA, period);
		const byCode = (code: string) =>
			report.items.filter((i) => i.code === code).map((i) => i.transaction_id);

		expect(byCode('category_missing')).toEqual(
			expect.arrayContaining([ids.categoryMissing, ids.needleAfterPage])
		);
		expect(byCode('category_missing')).not.toContain(ids.softDeletedBad);

		expect(byCode('income_patient_missing')).toEqual([ids.incomeNoPatient]);
		expect(byCode('expense_contact_missing')).toEqual([ids.expenseNoContact]);
		expect(byCode('fx_missing')).toEqual([ids.fxMissing]);
		expect(byCode('paid_amount_mismatch')).toEqual([ids.paidMismatch]);
		expect(byCode('unpaid_with_payment')).toEqual([ids.unpaidWithPay]);
		expect(byCode('partial_amount_invalid')).toEqual([ids.partialInvalid]);

		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.cleanIncome);
		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.cleanExpense);
		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.paidNullOk);
		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.unpaidZeroOk);
		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.partialOk);
		expect(report.items.every((i) => i.message_key.startsWith('reports.consistency.'))).toBe(
			true
		);
		expect(report.counts.error).toBeGreaterThanOrEqual(3);
		expect(report.counts.warning).toBeGreaterThanOrEqual(4);
		expect(report.counts_by_code.category_missing).toBeGreaterThanOrEqual(2);
		expect(report.counts_by_code.expense_contact_missing).toBe(1);
		expect(report.counts_by_code.paid_amount_mismatch).toBe(1);
		expect(report.truncated).toBe(false);
		expect(report.counts.error + report.counts.warning).toBe(report.items.length);
	});

	it('does not leak Tenant B issues into Tenant A', async () => {
		const report = await service.consistency(tenantA, period);
		expect(report.items.map((i) => i.transaction_id)).not.toContain(ids.tenantBBad);
	});

	it('Tenant B sees only its own orphan income', async () => {
		const report = await service.consistency(tenantB, period);
		expect(report.items.map((i) => i.transaction_id)).toEqual([ids.tenantBBad]);
		expect(report.items[0]?.code).toBe('income_patient_missing');
	});

	it('finds category issue beyond a 100-row client page window', async () => {
		const report = await service.consistency(tenantA, period);
		expect(report.items.map((i) => i.transaction_id)).toContain(ids.needleAfterPage);
		const needle = report.items.find((i) => i.transaction_id === ids.needleAfterPage);
		expect(needle?.code).toBe('category_missing');
	});
});
