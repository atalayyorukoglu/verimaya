import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Bakiye yaşlandırma: açık tutar `occurred_on`'a göre 0–30 / 31–60 / 61–90 / 90+ kovalarına
 * ayrılır ve en eski açık işlemin yaşı döner.
 *
 * Kanıtlanan iddialar:
 *  1. Kovalar doğru — sınıra tam oturan gün doğru kovada.
 *  2. **Dört kovanın toplamı `open_amount`'a eşit** (işaret korunuyor).
 *  3. Tahsil edilmiş tutar yaşlanmaz — yalnız açık kısım kovalanır.
 *  4. `oldest_open_days` en eski AÇIK işlemin yaşı.
 *  5. Tenant izolasyonu.
 *
 * Tenant bağlamı yalnız drizzle transaction + `set_config(..., true)` (SET LOCAL) ile
 * kuruluyor — AGENTS.md kural 7. Session-level `set_config(..., false)` yasaktır çünkü
 * testler arasında sızar ve izolasyon testini yalancı yeşile çevirebilir.
 */
const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenant<T>(tenantId: string, fn: (tx: TenantDb) => Promise<T>): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

/** `days` gün önceki tarihi ISO gün anahtarı olarak verir. */
function daysAgo(days: number): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

describe('reports balances — yaşlandırma', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let reportsService: ReportsService;
	let contactA = '';
	let contactB = '';

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);
		reportsService = new ReportsService(
			new TenantContextService({ client: db, sql } as unknown as never)
		);

		for (const [id, name] of [
			[tenantA, 'Aging A'],
			[tenantB, 'Aging B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${id}, ${name}, ${`aging-${id.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${id}, ${name}, ${`aging-${id.slice(0, 8)}`}, 'Europe/Istanbul')
			`;
		}

		await withTenant(tenantA, async (tx) => {
			const [type] = await tx.execute(drizzleSql`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik') returning id
			`);
			const typeId = (type as { id: string }).id;
			const [c] = await tx.execute(drizzleSql`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantA}, ${typeId}, 'Klinik', 'Yaşlandırma Kişisi') returning id
			`);
			contactA = (c as { id: string }).id;

			// 10 gün önce · tamamen açık 100,00 → d0_30
			// 45 gün önce · tamamen açık 200,00 → d31_60
			// 30 gün önce · tamamen açık  50,00 → d0_30 (sınıra tam oturan gün)
			// 120 gün önce · tamamen açık 400,00 → d90_plus  ← en eski açık
			// 200 gün önce · TAMAMEN TAHSİL 900,00 → hiçbir kovaya girmez, yaşı sayılmaz
			for (const [days, amount, status, paid] of [
				[10, 10000, 'unpaid', 0],
				[45, 20000, 'unpaid', 0],
				[30, 5000, 'unpaid', 0],
				[120, 40000, 'unpaid', 0],
				[200, 90000, 'paid', 90000]
			] as Array<[number, number, string, number]>) {
				await tx.execute(drizzleSql`
					insert into transactions (
						tenant_id, kind, title, occurred_on, status, amount, paid_amount, currency, contact_id
					) values (
						${tenantA}, 'income', 'Aging', ${daysAgo(days)}, ${status},
						${amount}, ${paid}, 'TRY', ${contactA}
					)
				`);
			}
		});

		await withTenant(tenantB, async (tx) => {
			const [type] = await tx.execute(drizzleSql`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Klinik') returning id
			`);
			const typeId = (type as { id: string }).id;
			const [c] = await tx.execute(drizzleSql`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name)
				values (${tenantB}, ${typeId}, 'Klinik', 'B Kişisi') returning id
			`);
			contactB = (c as { id: string }).id;
			await tx.execute(drizzleSql`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, paid_amount, currency, contact_id
				) values (
					${tenantB}, 'income', 'B Aging', ${daysAgo(400)}, 'unpaid', 77700, 0, 'TRY', ${contactB}
				)
			`);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('açık tutarı doğru kovalara ayırır; 30. gün d0_30 sınırındadır', async () => {
		const report = await reportsService.balances(tenantA);
		const row = report.items.find((i) => i.contact_id === contactA);
		expect(row).toBeDefined();

		// 10 gün (100,00) + 30 gün (50,00) = 150,00
		expect(row!.aging.d0_30).toBe(15000);
		expect(row!.aging.d31_60).toBe(20000);
		expect(row!.aging.d61_90).toBe(0);
		expect(row!.aging.d90_plus).toBe(40000);
	});

	it('dört kovanın toplamı open_amount ile birebir eşittir', async () => {
		const report = await reportsService.balances(tenantA);
		const row = report.items.find((i) => i.contact_id === contactA)!;
		const bucketSum =
			row.aging.d0_30 + row.aging.d31_60 + row.aging.d61_90 + row.aging.d90_plus;
		expect(bucketSum).toBe(row.open_amount);
		// Somut rakam: 100 + 200 + 50 + 400 = 750,00 (tahsil edilen 900,00 dahil değil)
		expect(row.open_amount).toBe(75000);
	});

	it('tahsil edilmiş tutar yaşlanmaz — 200 günlük kapalı işlem yaşı etkilemez', async () => {
		const report = await reportsService.balances(tenantA);
		const row = report.items.find((i) => i.contact_id === contactA)!;
		// En eski AÇIK işlem 120 günlük; 200 günlük olan tamamen tahsil edilmiş.
		expect(row.oldest_open_days).toBeGreaterThanOrEqual(119);
		expect(row.oldest_open_days).toBeLessThanOrEqual(121);
		expect(row.collected_amount).toBe(90000);
	});

	it('Tenant A, Tenant B satırını ve yaşlandırmasını göremez', async () => {
		const report = await reportsService.balances(tenantA);
		expect(report.items.some((i) => i.contact_id === contactB)).toBe(false);

		const reportB = await reportsService.balances(tenantB);
		expect(reportB.items.some((i) => i.contact_id === contactA)).toBe(false);
		const rowB = reportB.items.find((i) => i.contact_id === contactB)!;
		expect(rowB.aging.d90_plus).toBe(77700);
	});
});
