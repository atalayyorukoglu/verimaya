import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const testActor = { actorId: null, actorDisplayName: 'Case Responsible Test' };

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`
		);
		return fn(tx as TenantDb);
	});
}

describe('transactions case_contact_id / responsible_contact_id type guards', () => {
	const tenantId = randomUUID();
	let hastaId: string;
	let klinikId: string;
	let personelId: string;
	let service: TransactionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Tx Types', ${`tx-types-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Tx Types', ${`tx-types-${tenantId.slice(0, 8)}`})
		`;

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values
				(${tenantId}, 'Hasta', 0),
				(${tenantId}, 'Klinik', 1),
				(${tenantId}, 'Personel', 2)
				on conflict (tenant_id, name) do nothing`;
			const [hasta] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Hasta' limit 1),
					'Hasta', 'Hasta', 'Hasta One'
				) returning id
			`;
			const [klinik] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Klinik' limit 1),
					'Klinik', 'Klinik', 'Klinik One'
				) returning id
			`;
			const [personel] = await tx`
				insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantId},
					(select id from contact_types where tenant_id = ${tenantId} and name = 'Personel' limit 1),
					'Personel', 'Ali', 'Ali Personel'
				) returning id
			`;
			hastaId = hasta!.id as string;
			klinikId = klinik!.id as string;
			personelId = personel!.id as string;
		});

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;
		service = new TransactionsService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	const baseInput = {
		kind: 'expense' as const,
		title: null,
		subtitle: null,
		category: 'Konaklama',
		occurred_on: '2026-08-01',
		status: 'paid' as const,
		invoice_status: 'none' as const,
		payment_method: null,
		amount: 10000,
		paid_amount: 10000,
		currency: 'TRY' as const,
		amount_base: 10000,
		base_currency: 'TRY' as const,
		fx_rate: 1,
		fx_dated: '2026-08-01',
		contact_id: null as string | null,
		contact_label: 'Otel',
		description: null
	};

	it('rejects case_contact_id that is not Hasta with 400', async () => {
		await expect(
			withTenantSession(tenantId, (db) =>
				service.createWithDb(db, tenantId, {
					...baseInput,
					case_contact_id: klinikId,
					responsible_contact_id: null
				}, testActor)
			)
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('accepts case_contact_id when contact type is Hasta', async () => {
		const created = await withTenantSession(tenantId, (db) =>
			service.createWithDb(db, tenantId, {
				...baseInput,
				case_contact_id: hastaId,
				responsible_contact_id: null
			}, testActor)
		);
		expect(created.case_contact_id).toBe(hastaId);
	});

	it('rejects responsible_contact_id that is not Personel with 400', async () => {
		await expect(
			withTenantSession(tenantId, (db) =>
				service.createWithDb(db, tenantId, {
					...baseInput,
					case_contact_id: null,
					responsible_contact_id: hastaId
				}, testActor)
			)
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('accepts responsible_contact_id when contact type is Personel', async () => {
		const created = await withTenantSession(tenantId, (db) =>
			service.createWithDb(db, tenantId, {
				...baseInput,
				case_contact_id: null,
				responsible_contact_id: personelId
			}, testActor)
		);
		expect(created.responsible_contact_id).toBe(personelId);
	});

	it('filters list by case_contact_id', async () => {
		const listed = await service.list(tenantId, {
			limit: 50,
			case_contact_id: hastaId
		});
		expect(listed.items.length).toBeGreaterThanOrEqual(1);
		expect(listed.items.every((t) => t.case_contact_id === hastaId)).toBe(true);
	});
});
