import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactVisitLedgerService } from './contact-visit-ledger.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * PARA-01 — vizit bazlı mutabakatın tenant izolasyonu ve hesap kuralları.
 *
 * Üç şeyi birden doğruluyor, çünkü üçü de aynı fikstürle ölçülüyor:
 *  1. Tenant A'nın tablosunda Tenant B'nin satırı görünmez, B'nin hastası okunamaz.
 *  2. Ödeme/gider ayrımı: gider yalnız `case_contact_id` üzerinden sayılır.
 *  3. Vizit ataması: açık bağ → tarih penceresi → "Vizit belirsiz".
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantDb<T>(tenantId: string, fn: (db: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

describe('visit ledger tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let hotelA: string;
	let visitA1: string;
	let ledger: ContactVisitLedgerService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug, base_currency)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, 'TRY'),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, 'TRY')
		`;

		const kisiAc = async (tenantId: string, typeName: string, name: string) =>
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantId}, ${typeName}, 0)
					on conflict (tenant_id, name) do update set name = excluded.name`;
				const [row] = await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
					values (
						${tenantId},
						(select id from contact_types where tenant_id = ${tenantId} and name = ${typeName} limit 1),
						${typeName}, ${name}, ${name}
					)
					returning id
				`;
				return row!.id as string;
			});

		patientA = await kisiAc(tenantA, 'Hasta', 'Patient A');
		hotelA = await kisiAc(tenantA, 'Otel', 'Hotel A');
		patientB = await kisiAc(tenantB, 'Hasta', 'Patient B');

		visitA1 = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_visits (
					tenant_id, contact_id, visit_type, arrival_at, departure_at, status,
					quoted_total_minor, quoted_currency
				)
				values (
					${tenantA}, ${patientA}, 'visit_1',
					'2026-01-10T10:00:00Z', '2026-01-16T10:00:00Z', 'completed',
					1000000, 'TRY'
				)
				returning id
			`;
			return row!.id as string;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, category, occurred_on, status, amount, amount_base,
					paid_amount, currency, contact_id, case_contact_id, contact_visit_id
				)
				values
					-- Açık bağlı tahsilat: hasta karşı taraf.
					(${tenantA}, 'income', 'Visit 1 tahsilat', 'Tahsilat', '2026-01-12', 'paid',
						400000, 400000, 400000, 'TRY', ${patientA}, null, ${visitA1}),
					-- Bağsız ama pencereye düşen tahsilat (geliş − 2 … dönüş + 2).
					(${tenantA}, 'income', 'Visit 1 ikinci tahsilat', 'Tahsilat', '2026-01-17', 'paid',
						100000, 100000, 100000, 'TRY', null, ${patientA}, null),
					-- Otel gideri: karşı taraf otel, hasta case üzerinden.
					(${tenantA}, 'expense', 'Otel', 'Otel', '2026-01-13', 'paid',
						150000, 150000, 150000, 'TRY', ${hotelA}, ${patientA}, ${visitA1}),
					-- Klinik gideri, aynı vizit.
					(${tenantA}, 'expense', 'Klinik', 'Klinik', '2026-01-14', 'paid',
						50000, 50000, 50000, 'TRY', ${hotelA}, ${patientA}, ${visitA1}),
					-- Hastaya ÖDENEN taksi: karşı taraf hasta ama case yok → gidere sayılmaz.
					(${tenantA}, 'expense', 'Hastaya iade taksi', 'Transfer', '2026-01-15', 'paid',
						2000, 2000, 2000, 'TRY', ${patientA}, null, null),
					-- Vizit penceresine düşmeyen tahsilat → "Vizit belirsiz".
					(${tenantA}, 'income', 'Depozito', 'Tahsilat', '2025-11-01', 'paid',
						30000, 30000, 30000, 'TRY', ${patientA}, null, null)
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base,
					paid_amount, currency, contact_id
				)
				values (${tenantB}, 'income', 'B income', '2026-01-12', 'paid', 900000, 900000, 900000, 'TRY', ${patientB})
			`;
		});

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(tenantId, (db) => fn({ db }))
		} as TenantContextService;

		ledger = new ContactVisitLedgerService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('vizit satırı ödemeyi, gideri ve kârı ayrı ayrı toplar', async () => {
		const result = await ledger.get(tenantA, patientA);
		expect(result.is_patient).toBe(true);
		expect(result.base_currency).toBe('TRY');

		const visit = result.rows.find((r) => r.visit_id === visitA1)!;
		expect(visit.income_base).toBe(500_000);
		// Hastaya ödenen taksi (case yok) gidere girmez: 150.000 + 50.000.
		expect(visit.expense_base).toBe(200_000);
		expect(visit.profit_base).toBe(300_000);
		expect(visit.expense_by_category.map((b) => b.category)).toEqual(['Otel', 'Klinik']);
	});

	it('teklif varsa kalan tahsilatı gösterir', async () => {
		const result = await ledger.get(tenantA, patientA);
		const visit = result.rows.find((r) => r.visit_id === visitA1)!;
		expect(visit.quoted_total_minor).toBe(1_000_000);
		expect(visit.collected_quoted_minor).toBe(500_000);
		expect(visit.remaining_quoted_minor).toBe(500_000);
		expect(visit.other_currency_income_count).toBe(0);
	});

	it('pencereye düşmeyen satır "Vizit belirsiz" grubuna gider', async () => {
		const result = await ledger.get(tenantA, patientA);
		const bilinmeyen = result.rows.find((r) => r.visit_id === null)!;
		expect(bilinmeyen.income_base).toBe(30_000);
		expect(bilinmeyen.expense_base).toBe(0);
	});

	it('Tenant A toplamı Tenant B satırlarını içermez', async () => {
		const result = await ledger.get(tenantA, patientA);
		expect(result.totals.income_base).toBe(530_000);
		expect(result.totals.expense_base).toBe(200_000);
		expect(result.totals.profit_base).toBe(330_000);
	});

	it('Tenant A, Tenant B hastasının mutabakatını okuyamaz', async () => {
		await expect(ledger.get(tenantA, patientB)).rejects.toBeInstanceOf(NotFoundException);
	});

	it('Tenant B kendi hastasını görür, A satırlarını görmez', async () => {
		const result = await ledger.get(tenantB, patientB);
		expect(result.totals.income_base).toBe(900_000);
		expect(result.totals.expense_base).toBe(0);
	});
});
