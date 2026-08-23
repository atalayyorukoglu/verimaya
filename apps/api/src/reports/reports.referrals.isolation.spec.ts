import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
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
		await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
		return fn(tx as TenantDb);
	});
}

/**
 * Referans değeri raporu (ihtiyaç haritası §A). İki ayrı iddia kanıtlanıyor:
 *
 *  1. Gelir tanımı `ContactsService.financeSummary` ile birebir aynı (tek-referanslı
 *     kurulumda `total_income_base` === `financeSummary.income_base`).
 *  2. Tenant izolasyonu — Tenant B, Tenant A'nın referans satırını görmez.
 */
describe('reports referrals', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const coordinatorUserId = randomUUID();

	let reportsService: ReportsService;
	let contactsService: ContactsService;

	// Tenant A — çok referanslı referrer (gelirli + gelirsiz getirilen + soft-delete +
	// dönem dışı işlem senaryoları).
	let referrerA: string;
	let referredWithRevenue: string;
	let referredNoRevenue: string;

	// Tenant A — tek referanslı, financeSummary eşitlik testi için ayrı kurulum.
	let referrerSolo: string;
	let referredSolo: string;

	// Tenant B — izolasyon testi.
	let referrerB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(id, (db) => fn({ db }))
		} as TenantContextService;
		reportsService = new ReportsService(tenantContext);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		for (const [tenantId, name] of [
			[tenantA, 'Referrals Rpt A'],
			[tenantB, 'Referrals Rpt B']
		] as const) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`ref-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug)
				values (${tenantId}, ${name}, ${`ref-${tenantId.slice(0, 8)}`})
			`;
		}

		await sql`
			insert into "user" (id, name, email, email_verified, created_at, updated_at)
			values (
				${coordinatorUserId},
				'Koordinatör Y',
				${`coordinator-${coordinatorUserId.slice(0, 8)}@example.com`},
				true,
				now(),
				now()
			)
		`;
		await sql`
			insert into member (id, organization_id, user_id, role, created_at)
			values (${randomUUID()}, ${tenantA}, ${coordinatorUserId}, 'agent', now())
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0) on conflict do nothing`;
			const typeId = (
				await tx`select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1`
			)[0]!.id as string;

			const [referrer] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, title_name, assigned_user_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'X', 'X Referans Veren', 'Reklam Uzmanı', ${coordinatorUserId})
				returning id
			`;
			referrerA = referrer!.id as string;

			const [withRev] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'A', 'Getirilen A', ${referrerA})
				returning id
			`;
			referredWithRevenue = withRev!.id as string;

			const [noRev] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'B', 'Getirilen B', ${referrerA})
				returning id
			`;
			referredNoRevenue = noRev!.id as string;

			// Getirilen A: dönem içinde gelir (contact_id) + dönem içinde gider + dönem
			// dışı gelir (referred_count'u etkilemez ama total_income_base'i etkilemez) +
			// soft-delete edilmiş gelir (sayılmamalı).
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values
					(${tenantA}, 'income', 'Tedavi geliri', '2026-03-05', 'paid', 10000, 10000, 10000, 'TRY', ${referredWithRevenue}),
					(${tenantA}, 'expense', 'Otel gideri', '2026-03-06', 'paid', 3000, 3000, 3000, 'TRY', ${referredWithRevenue}),
					(${tenantA}, 'income', 'Dönem dışı gelir', '2026-01-01', 'paid', 50000, 50000, 50000, 'TRY', ${referredWithRevenue})
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id, deleted_at
				) values
					(${tenantA}, 'income', 'Silinmiş gelir', '2026-03-07', 'paid', 99999, 99999, 99999, 'TRY', ${referredWithRevenue}, now())
			`;

			// Tek-referanslı kurulum: financeSummary eşitlik testi. Hem contact_id hem
			// case_contact_id üzerinden gelen işlemler var — financeSummary'nin OR
			// kuralını gerçekten sınayan kurulum.
			const [soloReferrer] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantA}, ${typeId}, 'Hasta', 'Z', 'Z Solo Referrer')
				returning id
			`;
			referrerSolo = soloReferrer!.id as string;

			const [soloReferred] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantA}, ${typeId}, 'Hasta', 'C', 'Getirilen C', ${referrerSolo})
				returning id
			`;
			referredSolo = soloReferred!.id as string;

			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values
					(${tenantA}, 'income', 'Solo doğrudan gelir', '2026-04-01', 'paid', 8000, 8000, 8000, 'TRY', ${referredSolo})
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, case_contact_id
				) values
					(${tenantA}, 'income', 'Solo dosya geliri', '2026-04-02', 'paid', 1500, 1500, 1500, 'TRY', ${referredSolo})
			`;
			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values
					(${tenantA}, 'expense', 'Solo gider', '2026-04-03', 'paid', 500, 500, 500, 'TRY', ${referredSolo})
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Hasta', 0) on conflict do nothing`;
			const typeId = (
				await tx`select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1`
			)[0]!.id as string;

			const [referrer] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (${tenantB}, ${typeId}, 'Hasta', 'W', 'W Tenant B Referrer')
				returning id
			`;
			referrerB = referrer!.id as string;

			const [referred] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, referred_by_contact_id)
				values (${tenantB}, ${typeId}, 'Hasta', 'V', 'Getirilen V', ${referrerB})
				returning id
			`;

			await tx`
				insert into transactions (
					tenant_id, kind, title, occurred_on, status, amount, amount_base, paid_amount, currency, contact_id
				) values
					(${tenantB}, 'income', 'Tenant B geliri', '2026-03-05', 'paid', 20000, 20000, 20000, 'TRY', ${referred.id})
			`;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await sql`delete from "user" where id = ${coordinatorUserId}`;
		await closeDb();
	});

	it('lists referrer with title + coordinator, counts referred vs revenue, excludes deleted/out-of-period rows', async () => {
		const report = await reportsService.referrals(tenantA, { from: '2026-03-01', to: '2026-03-31' });
		const row = report.items.find((r) => r.referrer_contact_id === referrerA);

		expect(row).toBeDefined();
		expect(row?.referrer_display_name).toBe('X Referans Veren');
		expect(row?.referrer_title_name).toBe('Reklam Uzmanı');
		expect(row?.coordinator_name).toBe('Koordinatör Y');
		// referred_count zamansız: dönem filtresinden etkilenmez, iki getirilen de sayılır.
		expect(row?.referred_count).toBe(2);
		// Yalnız A'nın geliri var — B hiç işlem yapmadı.
		expect(row?.referred_with_revenue_count).toBe(1);
		// Dönem dışı 50000 ve soft-delete edilmiş 99999 hariç: yalnız 10000 sayılır.
		expect(row?.total_income_base).toBe(10000);
		expect(row?.total_expense_base).toBe(3000);
		expect(row?.total_net_base).toBe(7000);
	});

	it('omits contacts nobody referred (referred_count = 0 never appears)', async () => {
		const report = await reportsService.referrals(tenantA, {});
		expect(report.items.some((r) => r.referrer_contact_id === referredWithRevenue)).toBe(false);
	});

	it('matches ContactsService.financeSummary exactly for a single-referral setup', async () => {
		const report = await reportsService.referrals(tenantA, {});
		const row = report.items.find((r) => r.referrer_contact_id === referrerSolo);
		expect(row).toBeDefined();

		const summary = await contactsService.financeSummary(tenantA, referredSolo);

		expect(row?.total_income_base).toBe(summary.income_base);
		expect(row?.total_expense_base).toBe(summary.expense_base);
		expect(row?.total_net_base).toBe(summary.net_base);
		// Somut değerle de doğrula — sessiz bir 0===0 eşleşmesi olmasın.
		expect(summary.income_base).toBe(9500);
		expect(summary.expense_base).toBe(500);
	});

	it('tenant isolation — Tenant B sees only its own referral row, never Tenant A’s', async () => {
		const reportB = await reportsService.referrals(tenantB, {});
		expect(reportB.items).toHaveLength(1);
		expect(reportB.items[0]?.referrer_contact_id).toBe(referrerB);
		expect(reportB.items.some((r) => r.referrer_contact_id === referrerA)).toBe(false);
		expect(reportB.items.some((r) => r.referrer_contact_id === referrerSolo)).toBe(false);
	});
});
