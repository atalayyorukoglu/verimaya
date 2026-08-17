import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ReportsService } from './reports.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * Temassız kişiler raporu — "dokunuş" tanımının her kaynağı ayrı fixture ile sınanır:
 * randevu, işlem (kendi + vaka tarafı), vaka notu, hiç aktivite yok.
 * Ayrıca: gelecek randevu listeden düşürür, soft-delete aktivite saymaz,
 * kovalar limit'ten bağımsızdır ve tenant B, A'nın kişilerini görmez.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

/** Gün → şimdiden geriye timestamp (sorgu `now()` kullandığı için sabit tarih yazılmaz). */
function daysAgo(days: number): string {
	return `now() - interval '${days} days'`;
}

describe('reports untouched-contacts', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();

	const c = {
		/** Hiç aktivite yok, 120 gün önce açıldı → 'created', en eski */
		virgin: randomUUID(),
		/** 100 gün önce randevu → 'appointment' */
		oldAppointment: randomUUID(),
		/** 70 gün önce işlem (contact_id) → 'transaction' */
		oldTransaction: randomUUID(),
		/** 50 gün önce işlem ama vaka tarafında (case_contact_id) → 'transaction' */
		oldCaseTransaction: randomUUID(),
		/** 40 gün önce vaka notu → 'case_note' */
		oldNote: randomUUID(),
		/** 200 gün önce açıldı ama GELECEK randevusu var → listede OLMAMALI */
		futureAppointment: randomUUID(),
		/** 200 gün önce açıldı, tek aktivitesi soft-delete randevu → yine temassız */
		softDeletedActivity: randomUUID(),
		/** Dün açıldı, hiç aktivite yok → eşiğin altında, listede OLMAMALI */
		brandNew: randomUUID(),
		/** Hasta değil (Otel) → contact_type filtresiyle elenmeli */
		hotel: randomUUID(),
		/** Tenant B'nin kişisi → A'nın raporunda ASLA görünmemeli */
		tenantBContact: randomUUID()
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
			[tenantA, 'Untouched A'],
			[tenantB, 'Untouched B']
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`unt-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency)
				values (${tenantId}, ${name}, ${`unt-${tenantId.slice(0, 8)}`}, 'TRY')
			`;
		}

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') on conflict do nothing`;
			await tx`insert into contact_types (tenant_id, name) values (${tenantA}, 'Otel') on conflict do nothing`;

			const addContact = async (id: string, name: string, type: string, createdDaysAgo: number) => {
				await tx.unsafe(
					`insert into contacts (id, tenant_id, contact_type_id, contact_type_name,
						first_name, display_name, status, created_at, updated_at)
					 values ($1, $2,
						(select id from contact_types where tenant_id = $2 and name = $3 limit 1),
						$3, $4, $4, 'scheduled', ${daysAgo(createdDaysAgo)}, now())`,
					[id, tenantA, type, name]
				);
			};

			await addContact(c.virgin, 'Virgin', 'Hasta', 120);
			await addContact(c.oldAppointment, 'Old Appointment', 'Hasta', 300);
			await addContact(c.oldTransaction, 'Old Transaction', 'Hasta', 300);
			await addContact(c.oldCaseTransaction, 'Old Case Transaction', 'Hasta', 300);
			await addContact(c.oldNote, 'Old Note', 'Hasta', 300);
			await addContact(c.futureAppointment, 'Future Appointment', 'Hasta', 200);
			await addContact(c.softDeletedActivity, 'Soft Deleted Activity', 'Hasta', 200);
			await addContact(c.brandNew, 'Brand New', 'Hasta', 1);
			await addContact(c.hotel, 'Some Hotel', 'Otel', 300);

			// 100 gün önce randevu
			await tx.unsafe(
				`insert into appointments (id, tenant_id, contact_id, contact_display_name, starts_at, status, appointment_type)
				 values ($1, $2, $3, 'Old Appointment', ${daysAgo(100)}, 'scheduled', 'Konsültasyon')`,
				[randomUUID(), tenantA, c.oldAppointment]
			);
			// GELECEK randevu → dokunuş sayılır
			await tx.unsafe(
				`insert into appointments (id, tenant_id, contact_id, contact_display_name, starts_at, status, appointment_type)
				 values ($1, $2, $3, 'Future Appointment', now() + interval '7 days', 'scheduled', 'Konsültasyon')`,
				[randomUUID(), tenantA, c.futureAppointment]
			);
			// Soft-delete randevu → dokunuş SAYILMAZ
			await tx.unsafe(
				`insert into appointments (id, tenant_id, contact_id, contact_display_name, starts_at, status, appointment_type, deleted_at)
				 values ($1, $2, $3, 'Soft Deleted Activity', ${daysAgo(5)}, 'scheduled', 'Konsültasyon', now())`,
				[randomUUID(), tenantA, c.softDeletedActivity]
			);

			// 70 gün önce işlem — hasta tarafı
			await tx.unsafe(
				`insert into transactions (id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, contact_id)
				 values ($1, $2, 'income', 'Ödeme', 'Operasyon', (${daysAgo(70)})::date, 'paid',
					1000, 1000, 'TRY', 1000, 'TRY', $3)`,
				[randomUUID(), tenantA, c.oldTransaction]
			);
			// 50 gün önce işlem — vaka tarafı (case_contact_id)
			await tx.unsafe(
				`insert into transactions (id, tenant_id, kind, title, category, occurred_on, status,
					amount, paid_amount, currency, amount_base, base_currency, case_contact_id)
				 values ($1, $2, 'expense', 'Vaka gideri', 'Konaklama', (${daysAgo(50)})::date, 'paid',
					500, 500, 'TRY', 500, 'TRY', $3)`,
				[randomUUID(), tenantA, c.oldCaseTransaction]
			);

			// 40 gün önce vaka notu
			await tx.unsafe(
				`insert into case_notes (id, tenant_id, contact_id, author_display_name, body, created_at)
				 values ($1, $2, $3, 'Test Author', 'Görüşüldü', ${daysAgo(40)})`,
				[randomUUID(), tenantA, c.oldNote]
			);
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') on conflict do nothing`;
			await tx.unsafe(
				`insert into contacts (id, tenant_id, contact_type_id, contact_type_name,
					first_name, display_name, status, created_at, updated_at)
				 values ($1, $2,
					(select id from contact_types where tenant_id = $2 and name = 'Hasta' limit 1),
					'Hasta', 'Tenant B Patient', 'Tenant B Patient', 'scheduled', ${daysAgo(400)}, now())`,
				[c.tenantBContact, tenantB]
			);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('lists only contacts past the threshold, with the correct activity source', async () => {
		const res = await service.untouchedContacts(tenantA, {
			days: 30,
			contact_type: 'Hasta',
			limit: 50
		});

		const byId = new Map(res.items.map((i) => [i.contact_id, i]));

		expect(byId.get(c.virgin)?.last_activity_source).toBe('created');
		expect(byId.get(c.oldAppointment)?.last_activity_source).toBe('appointment');
		expect(byId.get(c.oldTransaction)?.last_activity_source).toBe('transaction');
		expect(byId.get(c.oldCaseTransaction)?.last_activity_source).toBe('transaction');
		expect(byId.get(c.oldNote)?.last_activity_source).toBe('case_note');

		// Gelecek randevusu olan aktif takiptedir — listede olmamalı.
		expect(byId.has(c.futureAppointment)).toBe(false);
		// Dün açılmış kayıt 30 günlük eşiği geçemez.
		expect(byId.has(c.brandNew)).toBe(false);
		// Otel, Hasta filtresiyle elenir.
		expect(byId.has(c.hotel)).toBe(false);
		// Tenant B'nin kişisi asla görünmez.
		expect(byId.has(c.tenantBContact)).toBe(false);
	});

	it('ignores soft-deleted activity — the contact stays untouched', async () => {
		const res = await service.untouchedContacts(tenantA, {
			days: 30,
			contact_type: 'Hasta',
			limit: 50
		});
		const row = res.items.find((i) => i.contact_id === c.softDeletedActivity);

		// 5 gün önceki randevu silinmiş; taban 200 günlük created_at kalır.
		expect(row).toBeDefined();
		expect(row?.last_activity_source).toBe('created');
		expect(row?.days_since).toBeGreaterThan(150);
	});

	it('orders oldest first and reports days_since', async () => {
		const res = await service.untouchedContacts(tenantA, {
			days: 30,
			contact_type: 'Hasta',
			limit: 50
		});

		const days = res.items.map((i) => i.days_since);
		expect([...days].sort((a, b) => b - a)).toEqual(days);
		expect(res.items[0]?.days_since).toBeGreaterThanOrEqual(res.items.at(-1) ? 0 : 0);
		expect(res.items.every((i) => i.days_since >= 30)).toBe(true);
	});

	it('buckets are counted over the whole set, not the limited page', async () => {
		const limited = await service.untouchedContacts(tenantA, {
			days: 30,
			contact_type: 'Hasta',
			limit: 1
		});

		expect(limited.items).toHaveLength(1);
		// Liste 1 satır ama sayım tam küme üzerinden. 30 günü geçen Hasta'lar:
		// virgin(120), oldAppointment(100), oldTransaction(70), oldCaseTransaction(50),
		// oldNote(40), softDeletedActivity(200) → 6.
		// futureAppointment (gelecek randevu) ve brandNew (1 gün) hariç; hotel Hasta değil.
		expect(limited.total).toBe(6);
		expect(limited.buckets.d30).toBe(6);
		// 60 günü geçenler: virgin(120), oldAppointment(100), oldTransaction(70),
		// softDeletedActivity(200) → 4
		expect(limited.buckets.d60).toBe(4);
		// 90 günü geçenler: virgin(120), oldAppointment(100), softDeletedActivity(200) → 3
		expect(limited.buckets.d90).toBe(3);
	});

	it('threshold narrows the list', async () => {
		const res = await service.untouchedContacts(tenantA, {
			days: 90,
			contact_type: 'Hasta',
			limit: 50
		});
		expect(res.items.every((i) => i.days_since >= 90)).toBe(true);
		expect(res.total).toBe(3);
	});

	it('tenant B sees only its own contact', async () => {
		const res = await service.untouchedContacts(tenantB, { days: 30, limit: 50 });
		expect(res.items).toHaveLength(1);
		expect(res.items[0]?.contact_id).toBe(c.tenantBContact);
	});
});
