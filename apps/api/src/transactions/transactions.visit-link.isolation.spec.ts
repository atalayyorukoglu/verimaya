import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import type { TransactionCreate } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';
import { TransactionsService } from './transactions.service';

/**
 * PARA-01 — işlem ↔ vizit bağı.
 *
 * Üç kural: alan hiç gönderilmezse tarihten tek uyan vizit bağlanır; açıkça `null`
 * gönderilirse boş kalır; başka kişinin viziti reddedilir.
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

/** `actorId: null` — denetim kaydı kullanıcı satırına bağlanmadan yazılabiliyor. */
const ACTOR = { actorId: null, actorDisplayName: 'Visit link test' } as never;

describe('transaction ↔ visit link', () => {
	const tenantA = randomUUID();
	let patientA: string;
	let otherPatient: string;
	let visitA: string;
	let otherVisit: string;
	let service: TransactionsService;

	const taban = (extra: Partial<TransactionCreate>) =>
		({
			kind: 'income',
			title: 'Tahsilat',
			subtitle: null,
			category: 'Tahsilat',
			occurred_on: '2026-03-04',
			status: 'paid',
			invoice_status: 'none',
			payment_method: null,
			amount: 100000,
			paid_amount: 100000,
			currency: 'TRY',
			amount_base: 100000,
			base_currency: 'TRY',
			fx_rate: null,
			fx_dated: null,
			contact_id: patientA,
			contact_label: null,
			case_contact_id: null,
			responsible_contact_id: null,
			description: null,
			...extra
		}) as TransactionCreate;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantA}, 'Tenant A', ${`tvl-${tenantA.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug) values (${tenantA}, 'Tenant A', ${`tvl-${tenantA.slice(0, 8)}`})
		`;

		const kisi = async (name: string) =>
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
					on conflict (tenant_id, name) do update set name = excluded.name`;
				const [row] = await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
					values (
						${tenantA},
						(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
						'Hasta', ${name}, ${name}
					)
					returning id
				`;
				return row!.id as string;
			});

		patientA = await kisi('Patient A');
		otherPatient = await kisi('Patient B');

		const vizit = async (contactId: string) =>
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				const [row] = await tx`
					insert into contact_visits (tenant_id, contact_id, visit_type, arrival_at, departure_at)
					values (${tenantA}, ${contactId}, 'visit_1', '2026-03-02T09:00:00Z', '2026-03-08T18:00:00Z')
					returning id
				`;
				return row!.id as string;
			});

		visitA = await vizit(patientA);
		otherVisit = await vizit(otherPatient);

		const tenantContext = {
			withTenant: async <T>(tenantId: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantDb(tenantId, (db) => fn({ db }))
		} as TenantContextService;

		service = new TransactionsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA]);
		await closeDb();
	});

	it('alan hiç gönderilmezse tarihten tek uyan vizit bağlanır', async () => {
		const input = taban({});
		delete (input as { contact_visit_id?: unknown }).contact_visit_id;
		const tx = await withTenantDb(tenantA, (db) => service.createWithDb(db, tenantA, input, ACTOR));
		expect(tx.contact_visit_id).toBe(visitA);
	});

	it('açıkça null gönderilirse otomatik eşleme kapanır', async () => {
		const tx = await withTenantDb(tenantA, (db) =>
			service.createWithDb(db, tenantA, taban({ contact_visit_id: null }), ACTOR)
		);
		expect(tx.contact_visit_id).toBeNull();
	});

	it('pencere dışındaki tarih bağlanmaz', async () => {
		const input = taban({ occurred_on: '2026-01-01' });
		delete (input as { contact_visit_id?: unknown }).contact_visit_id;
		const tx = await withTenantDb(tenantA, (db) => service.createWithDb(db, tenantA, input, ACTOR));
		expect(tx.contact_visit_id).toBeNull();
	});

	it('başka kişinin viziti reddedilir', async () => {
		await expect(
			withTenantDb(tenantA, (db) =>
				service.createWithDb(db, tenantA, taban({ contact_visit_id: otherVisit }), ACTOR)
			)
		).rejects.toBeInstanceOf(BadRequestException);
	});
});
