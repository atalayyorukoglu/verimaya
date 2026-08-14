import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import {
	TenantContextService,
	type TenantDb,
} from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * G-04: POST /v1/transactions/audit-draft — tenant isolation + shared rule engine.
 * Negative: Tenant A must not enrich from Tenant B's responsible contact.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(
	tenantId: string,
	fn: (tdb: TenantDb) => Promise<T>,
): Promise<T> {
	const { db } = getDb(databaseUrl);
	return db.transaction(async (tx) => {
		await tx.execute(
			drizzleSql`select set_config('app.current_tenant_id', ${tenantId}, true)`,
		);
		return fn(tx as TenantDb);
	});
}

describe('G-04: transactions audit-draft', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactA: string;
	let staffAInternal: string;
	let staffAExternal: string;
	let staffBExternal: string;
	let service: TransactionsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		service = new TransactionsService({
			withTenant: async <T>(
				id: string,
				fn: (ctx: { db: TenantDb }) => Promise<T>,
			) => withTenantSession(id, (tdb) => fn({ db: tdb })),
		} as TenantContextService);

		for (const [tenantId, name] of [
			[tenantA, 'AuditDraft A'],
			[tenantB, 'AuditDraft B'],
		] as Array<[string, string]>) {
			await sql`
				insert into organization (id, name, slug, created_at)
				values (${tenantId}, ${name}, ${`ad-${tenantId.slice(0, 8)}`}, now())
			`;
			await sql`
				insert into tenants (id, name, slug, base_currency)
				values (${tenantId}, ${name}, ${`ad-${tenantId.slice(0, 8)}`}, 'TRY')
			`;
		}

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values
				(${tenantA}, 'Klinik', 0),
				(${tenantA}, 'Personel', 1)
				on conflict (tenant_id, name) do nothing`;
			const [c] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, display_name, is_internal
				) values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Klinik' limit 1),
					'Klinik', 'Klinik A', false
				) returning id
			`;
			const [si] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, display_name, is_internal
				) values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Personel' limit 1),
					'Personel', 'Staff Internal', true
				) returning id
			`;
			const [se] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, display_name, is_internal
				) values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Personel' limit 1),
					'Personel', 'Staff External', false
				) returning id
			`;
			contactA = c!.id as string;
			staffAInternal = si!.id as string;
			staffAExternal = se!.id as string;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values
				(${tenantB}, 'Personel', 0)
				on conflict (tenant_id, name) do nothing`;
			const [se] = await tx`
				insert into contacts (
					tenant_id, contact_type_id, contact_type_name, display_name, is_internal
				) values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Personel' limit 1),
					'Personel', 'Staff B External', false
				) returning id
			`;
			staffBExternal = se!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('returns shared-engine issues for a draft (writes nothing)', async () => {
		const { sql } = getDb(databaseUrl);
		const before = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				select count(*)::int as n from transactions where tenant_id = ${tenantA}
			`;
			return Number(row!.n);
		});

		const result = await service.auditDraft(tenantA, {
			kind: 'income',
			category: null,
			contact_id: null,
			currency: 'EUR',
			amount: 10000,
			amount_base: null,
			status: 'unpaid',
		});

		expect(result.items.map((i) => i.code)).toEqual(
			expect.arrayContaining([
				'category_missing',
				'income_contact_missing',
				'fx_missing',
			]),
		);
		expect(
			result.items.every((i) =>
				i.message_key.startsWith('reports.consistency.'),
			),
		).toBe(true);

		const after = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				select count(*)::int as n from transactions where tenant_id = ${tenantA}
			`;
			return Number(row!.n);
		});
		expect(after).toBe(before);
	});

	it('flags contact_equals_responsible and responsible_not_internal for own contacts', async () => {
		const same = await service.auditDraft(tenantA, {
			kind: 'expense',
			category: 'Op',
			contact_id: contactA,
			responsible_contact_id: contactA,
			currency: 'TRY',
			amount: 1000,
			paid_amount: 1000,
			amount_base: 1000,
			status: 'paid',
		});
		expect(same.items.map((i) => i.code)).toContain(
			'contact_equals_responsible',
		);

		const external = await service.auditDraft(tenantA, {
			kind: 'expense',
			category: 'Op',
			contact_id: contactA,
			responsible_contact_id: staffAExternal,
			currency: 'TRY',
			amount: 1000,
			paid_amount: 1000,
			amount_base: 1000,
			status: 'paid',
		});
		expect(external.items.map((i) => i.code)).toContain(
			'responsible_not_internal',
		);

		const internal = await service.auditDraft(tenantA, {
			kind: 'expense',
			category: 'Op',
			contact_id: contactA,
			responsible_contact_id: staffAInternal,
			currency: 'TRY',
			amount: 1000,
			paid_amount: 1000,
			amount_base: 1000,
			status: 'paid',
		});
		expect(internal.items.map((i) => i.code)).not.toContain(
			'responsible_not_internal',
		);
	});

	it('does not enrich Tenant B responsible contact (negative isolation)', async () => {
		const result = await service.auditDraft(tenantA, {
			kind: 'expense',
			category: 'Op',
			contact_id: contactA,
			responsible_contact_id: staffBExternal,
			currency: 'TRY',
			amount: 1000,
			paid_amount: 1000,
			amount_base: 1000,
			status: 'paid',
		});
		// B's non-internal staff is invisible under RLS → enrichment null → rule skipped.
		expect(result.items.map((i) => i.code)).not.toContain(
			'responsible_not_internal',
		);
	});
});
