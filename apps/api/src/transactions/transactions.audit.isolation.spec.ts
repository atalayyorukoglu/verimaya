import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from './transactions.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-04: transaction create/update writes audit_logs; tenant isolation on reads.
 * Needs live Postgres (DATABASE_URL_APP).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const actorA = { actorId: null, actorDisplayName: 'Actor Tenant A' };
const actorB = { actorId: null, actorDisplayName: 'Actor Tenant B' };

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

describe('AUDIT-04: transaction create/update audit logs', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let hastaTypeA = '';
	let hastaTypeB = '';
	let patientA = '';
	let patientB = '';
	let transactionA = '';
	let transactionsService: TransactionsService;
	let contactsService: ContactsService;
	let auditLogsService: AuditLogsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql } = getDb(databaseUrl);

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		transactionsService = new TransactionsService(tenantContext);
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		auditLogsService = new AuditLogsService(tenantContext);

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

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: hastaTypeA,
				first_name: 'Patient A'
			});
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: hastaTypeB,
				first_name: 'Patient B'
			});
			return p.id;
		});

		transactionA = await withTenantSession(tenantA, async (tdb) => {
			const t = await transactionsService.createWithDb(
				tdb,
				tenantA,
				{
					kind: 'income',
					title: null,
					subtitle: 'VIP',
					category: 'Konaklama',
					occurred_on: '2026-08-01',
					status: 'paid',
					invoice_status: 'none',
					payment_method: null,
					amount: 5000,
					paid_amount: 5000,
					currency: 'TRY',
					amount_base: 5000,
					base_currency: 'TRY',
					fx_rate: null,
					fx_dated: null,
					contact_id: patientA,
					contact_label: null,
					description: null
				},
				actorA
			);
			return t.id;
		});

		await withTenantSession(tenantA, async (tdb) => {
			await transactionsService.updateWithDb(
				tdb,
				tenantA,
				transactionA,
				{ title: 'Updated Audit Title' },
				actorA
			);
		});

		await withTenantSession(tenantB, async (tdb) => {
			await transactionsService.createWithDb(
				tdb,
				tenantB,
				{
					kind: 'expense',
					title: 'Secret Tenant B Expense',
					subtitle: null,
					category: null,
					occurred_on: '2026-08-02',
					status: 'paid',
					invoice_status: 'none',
					payment_method: null,
					amount: 9000,
					paid_amount: 9000,
					currency: 'TRY',
					amount_base: 9000,
					base_currency: 'TRY',
					fx_rate: null,
					fx_dated: null,
					contact_id: patientB,
					contact_label: null,
					description: null
				},
				actorB
			);
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('writes create audit with deriveTransactionLabel (category › subtitle)', async () => {
		const result = await auditLogsService.list(tenantA, {
			limit: 25,
			action: 'create',
			entity_type: 'transaction',
			q: 'Konaklama'
		});
		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.entity_label).toBe('Konaklama › VIP');
		expect(result.items[0]!.actor_display_name).toBe(actorA.actorDisplayName);
	});

	it('writes update audit with deriveTransactionLabel from updated row', async () => {
		const result = await auditLogsService.list(tenantA, {
			limit: 25,
			action: 'update',
			entity_type: 'transaction',
			q: 'Updated Audit Title'
		});
		expect(result.items).toHaveLength(1);
		expect(result.items[0]!.entity_label).toBe('Updated Audit Title');
	});

	it('Tenant A cannot read Tenant B transaction audit logs', async () => {
		const result = await auditLogsService.list(tenantA, {
			limit: 25,
			entity_type: 'transaction',
			q: 'Secret Tenant B'
		});
		expect(result.items).toHaveLength(0);

		const allTxnLogs = await auditLogsService.list(tenantA, {
			limit: 50,
			entity_type: 'transaction'
		});
		expect(allTxnLogs.items.every((row) => row.entity_label !== 'Secret Tenant B Expense')).toBe(
			true
		);
	});

	it('Tenant B cannot read Tenant A transaction audit logs under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select entity_label, action
				from audit_logs
				where entity_type = 'transaction'
				order by created_at desc
			`;
		});

		expect(rows.every((r) => r.entity_label !== 'Updated Audit Title')).toBe(true);
		expect(rows.every((r) => r.entity_label !== 'Konaklama › VIP')).toBe(true);
		expect(rows.some((r) => r.entity_label === 'Secret Tenant B Expense')).toBe(true);
	});
});
