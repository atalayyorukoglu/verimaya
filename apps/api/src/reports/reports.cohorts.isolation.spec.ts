import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Tarih bazlı kohort — reklam ayı ≠ tahsilat ayı.
 * Negatif izolasyon + olgunlaşma + ROAS null + soft-delete + missing FX.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('reports cohorts', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();

	const c = {
		/** Ocak kohortu — Nisan tahsilatı → m3_plus */
		janPatient: randomUUID(),
		/** Soft-delete kişi — sayılmamalı */
		deletedPatient: randomUUID(),
		/** Soft-delete işlemli kişi — silinmiş işlem sayılmamalı */
		softTxPatient: randomUUID(),
		/** amount_base null yabancı para — missing_fx */
		fxMissingPatient: randomUUID(),
		/** Harcamasız ay (Şubat) — roas null */
		febPatient: randomUUID(),
		/** Tenant B — A'nın kohortuna girmemeli */
		tenantBPatient: randomUUID()
	};

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
			[tenantA, 'Cohort A'],
			[tenantB, 'Cohort B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`coh-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency, timezone)
				values (${tenantId}, ${name}, ${`coh-${tenantId.slice(0, 8)}`}, 'TRY', 'Europe/Istanbul')
			`;
		}

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing`;

			const addContact = async (
				id: string,
				name: string,
				createdAt: string,
				deletedAt: string | null = null
			) => {
				await tx.unsafe(
					`insert into contacts (id, tenant_id, contact_type_id, contact_type_name,
						first_name, display_name, status, created_at, updated_at, deleted_at)
					 values ($1, $2,
						(select id from contact_types where tenant_id = $2 and name = 'Hasta' limit 1),
						'Hasta', $3, $3, 'scheduled', $4::timestamptz, now(), $5::timestamptz)`,
					[id, tenantA, name, createdAt, deletedAt]
				);
			};

			await addContact(c.janPatient, 'Jan Patient', '2026-01-10T12:00:00+03:00');
			await addContact(c.deletedPatient, 'Deleted', '2026-01-12T12:00:00+03:00', '2026-02-01T00:00:00Z');
			await addContact(c.softTxPatient, 'Soft Tx', '2026-01-15T12:00:00+03:00');
			await addContact(c.fxMissingPatient, 'FX Missing', '2026-01-20T12:00:00+03:00');
			await addContact(c.febPatient, 'Feb Patient', '2026-02-05T12:00:00+03:00');

			// Ocak hastası tedavi edildi
			await tx`
				insert into appointments (
					id, tenant_id, contact_id, contact_display_name, starts_at, status, appointment_type
				)
				values (
					${randomUUID()}, ${tenantA}, ${c.janPatient}, 'Jan Patient',
					'2026-01-25T10:00:00Z', 'completed', 'Operasyon'
				)
			`;

			// Ocak reklam harcaması
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values (${tenantA}, 'meta', '2026-01-05', 'camp-jan', 100000, 'TRY', 1000, 50)
			`;

			// Nisan tahsilatı → Ocak kohortu + m3_plus
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, contact_id
				)
				values (
					${randomUUID()}, ${tenantA}, 'income', 'Nisan tahsilat', 'Operasyon', '2026-04-15', 'paid',
					300000, null, 'TRY', 300000, 'TRY', ${c.janPatient}
				)
			`;

			// Soft-delete işlem — sayılmamalı
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, contact_id, deleted_at
				)
				values (
					${randomUUID()}, ${tenantA}, 'income', 'Silinmiş', 'Operasyon', '2026-01-20', 'paid',
					999999, null, 'TRY', 999999, 'TRY', ${c.softTxPatient}, now()
				)
			`;

			// amount_base null + yabancı para → missing_fx (toplamı bozmaz)
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, contact_id
				)
				values (
					${randomUUID()}, ${tenantA}, 'income', 'FX yok', 'Operasyon', '2026-01-22', 'paid',
					50000, null, 'EUR', null, null, ${c.fxMissingPatient}
				)
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') on conflict do nothing`;
			await tx.unsafe(
				`insert into contacts (id, tenant_id, contact_type_id, contact_type_name,
					first_name, display_name, status, created_at, updated_at)
				 values ($1, $2,
					(select id from contact_types where tenant_id = $2 and name = 'Hasta' limit 1),
					'Hasta', 'Tenant B', 'Tenant B', 'scheduled', '2026-01-08T12:00:00+03:00', now())`,
				[c.tenantBPatient, tenantB]
			);
			await tx`
				insert into ad_metrics_daily (
					tenant_id, provider, date, campaign_id, spend_minor, currency, impressions, clicks
				)
				values (${tenantB}, 'google', '2026-01-05', 'camp-b', 999999, 'TRY', 9000, 900)
			`;
			await tx`
				insert into transactions (
					id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, contact_id
				)
				values (
					${randomUUID()}, ${tenantB}, 'income', 'B tahsilat', 'Operasyon', '2026-01-20', 'paid',
					888888, null, 'TRY', 888888, 'TRY', ${c.tenantBPatient}
				)
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('assigns April collection to January cohort maturation.m3_plus', async () => {
		const res = await service.cohorts(tenantA, {
			from: '2026-01-01',
			to: '2026-02-28'
		});

		expect(res.note_key).toBe('cohort_attribution_assumption');

		const jan = res.items.find((i) => i.cohort_month === '2026-01');
		expect(jan).toBeDefined();
		expect(jan!.contacts).toBe(3); // jan + softTx + fxMissing (deleted hariç)
		expect(jan!.treated).toBe(1);
		expect(jan!.spend_base).toBe(100000);
		expect(jan!.collected_base).toBe(300000);
		expect(jan!.roas).toBe(3);
		expect(jan!.maturation).toEqual({ m0: 0, m1: 0, m2: 0, m3_plus: 300000 });
	});

	it('returns null roas when spend_base is 0', async () => {
		const res = await service.cohorts(tenantA, {
			from: '2026-01-01',
			to: '2026-02-28'
		});
		const feb = res.items.find((i) => i.cohort_month === '2026-02');
		expect(feb).toBeDefined();
		expect(feb!.contacts).toBe(1);
		expect(feb!.spend_base).toBe(0);
		expect(feb!.roas).toBeNull();
	});

	it('excludes soft-deleted contacts and transactions', async () => {
		const res = await service.cohorts(tenantA, {
			from: '2026-01-01',
			to: '2026-02-28'
		});
		const jan = res.items.find((i) => i.cohort_month === '2026-01')!;
		// Silinmiş kişinin 999999 tahsilatı yok; soft-delete kişi contacts'a dahil değil
		expect(jan.collected_base).toBe(300000);
		expect(jan.contacts).toBe(3);
	});

	it('counts amount_base-null rows in missing_fx_count without inflating totals', async () => {
		const res = await service.cohorts(tenantA, {
			from: '2026-01-01',
			to: '2026-02-28'
		});
		expect(res.missing_fx_count).toBe(1);
		const jan = res.items.find((i) => i.cohort_month === '2026-01')!;
		expect(jan.collected_base).toBe(300000);
	});

	it('does not include tenant B contacts or spend in tenant A cohorts', async () => {
		const res = await service.cohorts(tenantA, {
			from: '2026-01-01',
			to: '2026-02-28'
		});
		const jan = res.items.find((i) => i.cohort_month === '2026-01')!;
		expect(jan.spend_base).toBe(100000);
		expect(jan.collected_base).toBe(300000);

		const resB = await service.cohorts(tenantB, {
			from: '2026-01-01',
			to: '2026-02-28'
		});
		const janB = resB.items.find((i) => i.cohort_month === '2026-01');
		expect(janB?.contacts).toBe(1);
		expect(janB?.spend_base).toBe(999999);
		expect(janB?.collected_base).toBe(888888);
	});
});
