import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * TEST-01 (Faz 2.4): transactions tenant isolation. Same template as
 * `webhook-subscriptions.isolation.spec.ts` — services instantiated directly with a faked
 * `TenantContextService` so real Postgres RLS (`SET LOCAL app.current_tenant_id`) is what
 * actually does the blocking, not an app-level `where tenant_id = ...`.
 *
 * Needs a live Postgres (DATABASE_URL_APP) — see 0.3. Not runnable in this sandbox (no
 * docker); written and reasoned through, not executed.
 *
 * Scope note: `TransactionsController` has no `GET /:id` or `DELETE` route, and
 * `TransactionsService` has no `get()`/`remove()` — there is nothing to test for
 * get-by-id- or delete-isolation on this resource today (the plan doc's "list/get/update/
 * delete" is aspirational here). What's covered is what actually exists: list, cross-tenant
 * `contact_id`/`contact_id` filter leakage, and update.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const testActor = { actorId: null, actorDisplayName: 'Transactions Isolation Test' };

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

describe('transactions tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let contactTypeA: string;
	let contactTypeB: string;
	let hastaTypeA: string;
	let hastaTypeB: string;
	let contactA: string;
	let contactB: string;
	let transactionA: string;
	let transactionB: string;
	let transactionsService: TransactionsService;
	let contactsService: ContactsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		transactionsService = new TransactionsService(tenantContext);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`tenant-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`tenant-b-${tenantB.slice(0, 8)}`})
		`;

		hastaTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Hasta') returning id
			`;
			return row!.id as string;
		});
		hastaTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Hasta') returning id
			`;
			return row!.id as string;
		});
		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik A') returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Klinik B') returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: hastaTypeA,
				first_name: 'Patient A'
			});
			return p.id;});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: hastaTypeB,
				first_name: 'Patient B'
			});
			return p.id;});

		contactA = await withTenantSession(tenantA, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Contact A'
			});
			return c.id;});
		contactB = await withTenantSession(tenantB, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Contact B'
			});
			return c.id;});

		transactionA = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'income',
				title: 'Transaction A',
				subtitle: null,
				category: null,
				occurred_on: '2026-01-15',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 1000,
				paid_amount: 1000,
				currency: 'TRY',
				amount_base: 1000,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;});
		transactionB = await withTenantSession(tenantB, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantB, {
				kind: 'income',
				title: 'Transaction B',
				subtitle: null,
				category: null,
				occurred_on: '2026-01-15',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 2000,
				paid_amount: 2000,
				currency: 'TRY',
				amount_base: 2000,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientB,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A lists only its own transaction', async () => {
		const result = await transactionsService.list(tenantA, { limit: 25 });
		expect(result.items.map((t) => t.id)).toEqual([transactionA]);
		expect(result.items.some((t) => t.id === transactionB)).toBe(false);
	});

	it('list orders by occurred_on desc then id (stable cursor)', async () => {
		const olderId = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'expense',
				title: 'Older date',
				subtitle: null,
				category: null,
				occurred_on: '2025-06-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 500,
				paid_amount: 500,
				currency: 'TRY',
				amount_base: 500,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;});
		const newerId = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'expense',
				title: 'Newer date',
				subtitle: null,
				category: null,
				occurred_on: '2026-06-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 700,
				paid_amount: 700,
				currency: 'TRY',
				amount_base: 700,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;});

		const page1 = await transactionsService.list(tenantA, { limit: 1 });
		expect(page1.items).toHaveLength(1);
		expect(page1.items[0]!.id).toBe(newerId);
		expect(page1.next_cursor).toBeTruthy();

		const page2 = await transactionsService.list(tenantA, {
			limit: 10,
			cursor: page1.next_cursor!
		});
		expect(page2.items.map((t) => t.id)).toContain(olderId);
		expect(page2.items.map((t) => t.id)).toContain(transactionA);
		expect(page2.items.map((t) => t.id)).not.toContain(newerId);
	});

	it('Tenant B lists only its own transaction', async () => {
		const result = await transactionsService.list(tenantB, { limit: 25 });
		expect(result.items.map((t) => t.id)).toEqual([transactionB]);
		expect(result.items.some((t) => t.id === transactionA)).toBe(false);
	});

	it("Tenant A's contact_id filter using Tenant B's patient does not leak Tenant B's transaction", async () => {
		const result = await transactionsService.list(tenantA, { limit: 25, contact_id: patientB });
		expect(result.items).toHaveLength(0);
	});

	it("Tenant A's contact_id filter using Tenant B's contact does not leak Tenant B's transaction", async () => {
		const result = await transactionsService.list(tenantA, { limit: 25, contact_id: contactB });
		expect(result.items).toHaveLength(0);
	});

	it('Tenant A cannot update Tenant B transaction', async () => {
		await withTenantSession(tenantA, async (tdb) => {
			await expect(
				transactionsService.updateWithDb(tdb, tenantA, transactionB, { title: 'Hacked by A' }, testActor)
			).rejects.toBeInstanceOf(NotFoundException);});

		const stillB = await transactionsService.list(tenantB, { limit: 25 });
		expect(stillB.items.find((t) => t.id === transactionB)?.title).toBe('Transaction B');
	});

	it('GAP-03: kind / status / category / q filters narrow results without tenant leak', async () => {
		const expenseId = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'expense',
				title: 'Hotel stay Alpha',
				subtitle: null,
				category: 'Konaklama',
				occurred_on: '2026-03-01',
				status: 'unpaid',
				invoice_status: 'none',
				payment_method: null,
				amount: 3000,
				paid_amount: null,
				currency: 'TRY',
				amount_base: 3000,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: 'nightly rate'
			}, testActor);
			return t.id;});

		const byKind = await transactionsService.list(tenantA, { limit: 25, kind: 'expense' });
		expect(byKind.items.every((t) => t.kind === 'expense')).toBe(true);
		expect(byKind.items.map((t) => t.id)).toContain(expenseId);
		expect(byKind.items.map((t) => t.id)).not.toContain(transactionA);

		const byStatus = await transactionsService.list(tenantA, { limit: 25, status: 'unpaid' });
		expect(byStatus.items.map((t) => t.id)).toEqual([expenseId]);

		const byCategory = await transactionsService.list(tenantA, {
			limit: 25,
			category: 'Konaklama'
		});
		expect(byCategory.items.map((t) => t.id)).toEqual([expenseId]);

		const byQ = await transactionsService.list(tenantA, { limit: 25, q: 'Alpha' });
		expect(byQ.items.map((t) => t.id)).toEqual([expenseId]);

		const leak = await transactionsService.list(tenantA, {
			limit: 25,
			kind: 'income',
			contact_id: patientB
		});
		expect(leak.items).toHaveLength(0);
	});

	it('from / to inclusive date range does not leak Tenant B', async () => {
		const inRangeId = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'income',
				title: 'In range',
				subtitle: null,
				category: null,
				occurred_on: '2026-05-15',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 500,
				paid_amount: 500,
				currency: 'TRY',
				amount_base: 500,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;
		});
		await withTenantSession(tenantA, async (tdb) => {
			await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'income',
				title: 'Out of range',
				subtitle: null,
				category: null,
				occurred_on: '2026-06-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 500,
				paid_amount: 500,
				currency: 'TRY',
				amount_base: 500,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
		});

		const ranged = await transactionsService.list(tenantA, {
			limit: 25,
			from: '2026-05-01',
			to: '2026-05-31'
		});
		expect(ranged.items.map((t) => t.id)).toContain(inRangeId);
		expect(
			ranged.items.every((t) => t.occurred_on >= '2026-05-01' && t.occurred_on <= '2026-05-31')
		).toBe(true);

		const leakRange = await transactionsService.list(tenantA, {
			limit: 25,
			from: '2026-01-01',
			to: '2026-12-31',
			contact_id: patientB
		});
		expect(leakRange.items).toHaveLength(0);
	});

	it('total_count reflects filters and is not reduced by cursor', async () => {
		const taggedId = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(tdb, tenantA, {
				kind: 'income',
				title: 'TotalCount Marker',
				subtitle: null,
				category: 'CountTag',
				occurred_on: '2026-07-01',
				status: 'paid',
				invoice_status: 'none',
				payment_method: null,
				amount: 111,
				paid_amount: 111,
				currency: 'TRY',
				amount_base: 111,
				base_currency: 'TRY',
				fx_rate: null,
				fx_dated: null,
				contact_id: patientA,
				contact_label: null,
				description: null
			}, testActor);
			return t.id;});

		const filtered = await transactionsService.list(tenantA, {
			limit: 25,
			category: 'CountTag'
		});
		expect(filtered.items.map((t) => t.id)).toEqual([taggedId]);
		expect(filtered.total_count).toBe(1);

		const all = await transactionsService.list(tenantA, { limit: 25 });
		expect(all.total_count).toBeGreaterThan(1);

		const page1 = await transactionsService.list(tenantA, { limit: 1 });
		expect(page1.items).toHaveLength(1);
		expect(page1.next_cursor).toBeTruthy();
		expect(page1.total_count).toBe(all.total_count);

		const page2 = await transactionsService.list(tenantA, {
			limit: 1,
			cursor: page1.next_cursor!
		});
		expect(page2.total_count).toBe(all.total_count);
		expect(page2.total_count).toBeGreaterThan(page2.items.length);
	});
});
