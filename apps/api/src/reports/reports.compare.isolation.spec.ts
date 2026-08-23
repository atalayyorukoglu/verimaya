import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Dönem karşılaştırması (`compare=previous`) — summary + appointment-metrics.
 * docs/2026-08-23-maya-icgoru-sorulari.md § 6/7 adım 4.
 *
 * Fixture tarihleri iki dönemin sınırını da kapsar ki "önceki dönemin verisi mevcut
 * döneme sızmıyor" doğrudan rakamlarla kanıtlansın (sızıntı olsaydı toplamlar değişirdi).
 *
 * Tenant bağlamı gerçek `TenantContextService.withTenant` (drizzle transaction +
 * `SET LOCAL app.current_tenant_id`) — session-level `set_config` yalnız fixture
 * kurulumunda, RLS'e tabi olmayan/insert amaçlı ham `sql` çağrılarında kullanılır.
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

describe('reports dönem karşılaştırması (compare=previous)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const patientA = randomUUID();
	const patientB = randomUUID();

	let serviceA: ReportsService;
	let serviceB: ReportsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		const makeService = () =>
			new ReportsService(
				new TenantContextService({
					client: db,
					sql
				} as unknown as never)
			);

		serviceA = makeService();
		serviceB = makeService();

		for (const [tenantId, name] of [
			[tenantA, 'Compare A'],
			[tenantB, 'Compare B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`cmp-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, timezone)
				values (${tenantId}, ${name}, ${`cmp-${tenantId.slice(0, 8)}`}, 'Europe/Istanbul')
			`;
		}

		await withTenantSession(tenantA, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing`;
			});
			await sql`insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientA}, ${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Compare Patient A', 'Compare Patient A', 'scheduled', now(), now())`;

			// Transactions: 2026-06-30 (dışarıda) / 2026-07-01 + 07-31 (önceki dönem) /
			// 2026-08-01 + 08-31 (mevcut dönem) / 2026-09-01 (dışarıda).
			const txSeeds: Array<{ occurredOn: string; amount: number }> = [
				{ occurredOn: '2026-06-30', amount: 1000 },
				{ occurredOn: '2026-07-01', amount: 3000 },
				{ occurredOn: '2026-07-31', amount: 2000 },
				{ occurredOn: '2026-08-01', amount: 10000 },
				{ occurredOn: '2026-08-31', amount: 10000 },
				{ occurredOn: '2026-09-01', amount: 1000 }
			];
			for (const t of txSeeds) {
				await sql`
					insert into transactions (
						tenant_id, kind, title, category, occurred_on, status, amount, amount_base, paid_amount, currency
					) values (
						${tenantA}, 'income', 'Compare Tx', 'Genel', ${t.occurredOn}, 'paid', ${t.amount}, ${t.amount}, ${t.amount}, 'TRY'
					)
				`;
			}

			// Appointments: aynı sınır deseni, starts_at 10:00Z (Istanbul içinde gün kaymaz).
			const apptSeeds = [
				'2026-06-30T10:00:00Z',
				'2026-07-01T10:00:00Z',
				'2026-07-31T10:00:00Z',
				'2026-08-01T10:00:00Z',
				'2026-08-31T10:00:00Z',
				'2026-09-01T10:00:00Z'
			];
			for (const at of apptSeeds) {
				await sql`
					insert into appointments (
						tenant_id, contact_id, contact_display_name, title, status, starts_at, created_at, updated_at
					) values (
						${tenantA}, ${patientA}, 'Compare Patient A', 'visit', 'completed', ${at}, now(), now()
					)
				`;
			}
		});

		// Tenant B: aynı iki dönemde büyük, ayırt edici rakamlar — sızarsa toplamlar bozulur.
		await withTenantSession(tenantB, async () => {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
				await tx`insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') on conflict do nothing`;
			});
			await sql`insert into contacts (id, tenant_id, contact_type_id, contact_type_name, first_name, display_name, status, created_at, updated_at)
				values (
					${patientB}, ${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Compare Patient B', 'Compare Patient B', 'scheduled', now(), now())`;
			await sql`
				insert into transactions (
					tenant_id, kind, title, category, occurred_on, status, amount, amount_base, paid_amount, currency
				) values
					(${tenantB}, 'income', 'Compare B Jul', 'Genel', '2026-07-15', 'paid', 999999, 999999, 999999, 'TRY'),
					(${tenantB}, 'income', 'Compare B Aug', 'Genel', '2026-08-15', 'paid', 888888, 888888, 888888, 'TRY')
			`;
			await sql`
				insert into appointments (
					tenant_id, contact_id, contact_display_name, title, status, starts_at, created_at, updated_at
				) values (
					${tenantB}, ${patientB}, 'Compare Patient B', 'visit', 'completed', '2026-08-15T10:00:00Z', now(), now()
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	describe('summary', () => {
		const period = { from: '2026-08-01', to: '2026-08-31' };

		it('compare yokken cevap bugünkü şekliyle birebir aynı (regresyon)', async () => {
			const withoutCompare = await serviceA.summary(tenantA, period);
			expect(withoutCompare.income_base).toBe(20000);
			expect(withoutCompare.transaction_count).toBe(2);
			expect('previous' in withoutCompare).toBe(false);
			expect(withoutCompare.previous).toBeUndefined();
		});

		it('compare=previous → önceki dönem penceresi doğru (31 gün → 31 gün)', async () => {
			const result = await serviceA.summary(tenantA, { ...period, compare: 'previous' });
			expect(result.income_base).toBe(20000);
			expect(result.transaction_count).toBe(2);
			expect(result.previous).toBeDefined();
			expect(result.previous!.period).toEqual({ from: '2026-07-01', to: '2026-07-31' });
			expect(result.previous!.income_base).toBe(5000);
			expect(result.previous!.transaction_count).toBe(2);
		});

		it('11 günlük özel pencere → önceki 11 gün doğru hesaplanıyor', async () => {
			const result = await serviceA.summary(tenantA, {
				from: '2026-08-10',
				to: '2026-08-20',
				compare: 'previous'
			});
			expect(result.previous!.period).toEqual({ from: '2026-07-30', to: '2026-08-09' });
		});

		it('from/to eksikken compare sessizce yok sayılır', async () => {
			const result = await serviceA.summary(tenantA, { compare: 'previous' });
			expect(result.previous).toBeUndefined();
		});

		it('önceki dönemin verisi mevcut döneme sızmıyor (tarih sınırı)', async () => {
			const result = await serviceA.summary(tenantA, { ...period, compare: 'previous' });
			// 2026-06-30 (1000) ve 2026-09-01 (1000) hiçbir toplamda yer almamalı.
			expect(result.income_base).toBe(20000);
			expect(result.previous!.income_base).toBe(5000);
			expect(result.income_base + result.previous!.income_base).toBe(25000);
		});

		it('tenant izolasyonu: A, B verisini görmez', async () => {
			const resultA = await serviceA.summary(tenantA, { ...period, compare: 'previous' });
			expect(resultA.income_base).toBe(20000);
			expect(resultA.previous!.income_base).toBe(5000);

			const resultB = await serviceB.summary(tenantB, { ...period, compare: 'previous' });
			expect(resultB.income_base).toBe(888888);
			expect(resultB.previous!.income_base).toBe(999999);
		});
	});

	describe('appointment-metrics', () => {
		const period = { from: '2026-08-01', to: '2026-08-31' };

		it('compare yokken cevap bugünkü şekliyle birebir aynı (regresyon)', async () => {
			const withoutCompare = await serviceA.appointmentMetrics(tenantA, period);
			expect(withoutCompare.total).toBe(2);
			expect('previous' in withoutCompare).toBe(false);
			expect(withoutCompare.previous).toBeUndefined();
		});

		it('compare=previous → önceki dönem penceresi doğru ve sızıntısız', async () => {
			const result = await serviceA.appointmentMetrics(tenantA, {
				...period,
				compare: 'previous'
			});
			expect(result.total).toBe(2);
			expect(result.previous).toBeDefined();
			expect(result.previous!.period).toEqual({ from: '2026-07-01', to: '2026-07-31' });
			expect(result.previous!.total).toBe(2);
		});

		it('from/to eksikken compare sessizce yok sayılır', async () => {
			const result = await serviceA.appointmentMetrics(tenantA, { compare: 'previous' });
			expect(result.previous).toBeUndefined();
		});

		it('tenant izolasyonu: A, B verisini görmez', async () => {
			const resultA = await serviceA.appointmentMetrics(tenantA, {
				...period,
				compare: 'previous'
			});
			expect(resultA.total).toBe(2);
			expect(resultA.previous!.total).toBe(2);

			const resultB = await serviceB.appointmentMetrics(tenantB, {
				...period,
				compare: 'previous'
			});
			expect(resultB.total).toBe(1);
			expect(resultB.previous!.total).toBe(0);
		});
	});
});
