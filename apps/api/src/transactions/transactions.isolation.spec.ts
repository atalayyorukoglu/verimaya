import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';

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
 * `patient_id`/`contact_id` filter leakage, and update.
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

describe('transactions tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let contactTypeA: string;
	let contactTypeB: string;
	let contactA: string;
	let contactB: string;
	let transactionA: string;
	let transactionB: string;
	let transactionsService: TransactionsService;
	let patientsService: PatientsService;
	let contactsService: ContactsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, () => fn({ db }))
		} as TenantContextService;

		transactionsService = new TransactionsService(tenantContext);
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());
		contactsService = new ContactsService(tenantContext);

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

		contactTypeA = await withTenantSession(tenantA, async () => {
			const [row] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantA}, 'Klinik A') returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await withTenantSession(tenantB, async () => {
			const [row] = await sql`
				insert into contact_types (tenant_id, name) values (${tenantB}, 'Klinik B') returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async () => {
			const p = await patientsService.createWithDb(db, tenantA, { full_name: 'Patient A' });
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async () => {
			const p = await patientsService.createWithDb(db, tenantB, { full_name: 'Patient B' });
			return p.id;
		});

		contactA = await withTenantSession(tenantA, async () => {
			const c = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Contact A'
			});
			return c.id;
		});
		contactB = await withTenantSession(tenantB, async () => {
			const c = await contactsService.createWithDb(db, tenantB, {
				contact_type_id: contactTypeB,
				display_name: 'Contact B'
			});
			return c.id;
		});

		transactionA = await withTenantSession(tenantA, async () => {
			const t = await transactionsService.createWithDb(db, tenantA, {
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
				patient_id: patientA,
				contact_id: contactA,
				contact_label: null,
				description: null
			});
			return t.id;
		});
		transactionB = await withTenantSession(tenantB, async () => {
			const t = await transactionsService.createWithDb(db, tenantB, {
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
				patient_id: patientB,
				contact_id: contactB,
				contact_label: null,
				description: null
			});
			return t.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from transactions where tenant_id = ${tenantA}`;
			await sql`delete from patients where tenant_id = ${tenantA}`;
			await sql`delete from contacts where tenant_id = ${tenantA}`;
			await sql`delete from contact_types where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from transactions where tenant_id = ${tenantB}`;
			await sql`delete from patients where tenant_id = ${tenantB}`;
			await sql`delete from contacts where tenant_id = ${tenantB}`;
			await sql`delete from contact_types where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own transaction', async () => {
		const result = await transactionsService.list(tenantA, { limit: 25 });
		expect(result.items.map((t) => t.id)).toEqual([transactionA]);
		expect(result.items.some((t) => t.id === transactionB)).toBe(false);
	});

	it('Tenant B lists only its own transaction', async () => {
		const result = await transactionsService.list(tenantB, { limit: 25 });
		expect(result.items.map((t) => t.id)).toEqual([transactionB]);
		expect(result.items.some((t) => t.id === transactionA)).toBe(false);
	});

	it("Tenant A's patient_id filter using Tenant B's patient does not leak Tenant B's transaction", async () => {
		const result = await transactionsService.list(tenantA, { limit: 25, patient_id: patientB });
		expect(result.items).toHaveLength(0);
	});

	it("Tenant A's contact_id filter using Tenant B's contact does not leak Tenant B's transaction", async () => {
		const result = await transactionsService.list(tenantA, { limit: 25, contact_id: contactB });
		expect(result.items).toHaveLength(0);
	});

	it('Tenant A cannot update Tenant B transaction', async () => {
		await withTenantSession(tenantA, async () => {
			await expect(
				transactionsService.updateWithDb(db, tenantA, transactionB, { title: 'Hacked by A' })
			).rejects.toBeInstanceOf(NotFoundException);
		});

		const stillB = await transactionsService.list(tenantB, { limit: 25 });
		expect(stillB.items.find((t) => t.id === transactionB)?.title).toBe('Transaction B');
	});
});
