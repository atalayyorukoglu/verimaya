import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq , sql as drizzleSql} from 'drizzle-orm';
import postgres from 'postgres';
import { closeDb, getDb } from '../db/client';
import { appointments } from '../db/schema/appointments';
import { contacts } from '../db/schema/contacts';
import { transactions } from '../db/schema/transactions';
import { AppointmentsService } from '../appointments/appointments.service';
import { ContactsService } from '../contacts/contacts.service';
import { ReportsService } from '../reports/reports.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { TransactionsService } from '../transactions/transactions.service';

/**
 * GAP-06: soft-delete for patients / transactions / appointments / contacts.
 * Row stays with deleted_at; list/detail/report/dup hide; audit delete written.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const adminDatabaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://verimaya:verimaya@localhost:5433/verimaya';

const actor = { actorId: null, actorDisplayName: 'Gap06 SoftDelete' };

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

async function expectAuditDelete(
	tenantId: string,
	entityType: string,
	entityLabel: string
) {
	const admin = postgres(adminDatabaseUrl, { max: 1 });
	try {
		const rows = await admin`
			select action, entity_type, entity_label
			from audit_logs
			where tenant_id = ${tenantId}::uuid
				and action = 'delete'
				and entity_type = ${entityType}
				and entity_label = ${entityLabel}
		`;
		expect(rows.length).toBeGreaterThan(0);
	} finally {
		await admin.end();
	}
}

describe('GAP-06 soft-delete isolation', () => {
	const tenantId = randomUUID();
	let contactTypeId = '';
	let clinicContactTypeId = '';
	let contactsService: ContactsService;
	let transactionsService: TransactionsService;
	let appointmentsService: AppointmentsService;
	let reportsService: ReportsService;
	let db: TenantDb;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;

		const admin = postgres(adminDatabaseUrl, { max: 1 });
		await admin`
			alter table audit_logs drop constraint if exists audit_logs_entity_type_chk
		`;
		await admin`
			alter table audit_logs add constraint audit_logs_entity_type_chk check ("entity_type" in (
				'contact', 'appointment', 'transaction', 'inbound_message', 'file', 'tenant', 'user'
			))
		`;
		await admin.end();

		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		transactionsService = new TransactionsService(tenantContext);
		appointmentsService = new AppointmentsService(tenantContext);
		reportsService = new ReportsService(tenantContext);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'SoftDelete Tenant', ${`sd-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'SoftDelete Tenant', ${`sd-${tenantId.slice(0, 8)}`})
		`;

		contactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
		clinicContactTypeId = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Klinik', 1)
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantId}`;
			await tx`delete from transactions where tenant_id = ${tenantId}`;
			await tx`delete from appointments where tenant_id = ${tenantId}`;
			await tx`delete from contacts where tenant_id = ${tenantId}`;
			await tx`delete from contacts where tenant_id = ${tenantId}`;
			await tx`delete from contact_types where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('patient soft-delete: list/get/dup/report hide + audit + row remains', async () => {
		const email = `sd-patient-${randomUUID()}@example.com`;
		const label = 'Soft Delete Patient';
		let patientId = '';

		await withTenantSession(tenantId, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: contactTypeId,
				first_name: label,
				status: 'scheduled',
				email
			});
			patientId = p.id;
			await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: contactTypeId,
				first_name: `${label} Twin`,
				status: 'scheduled',
				email
			});});

		await withTenantSession(tenantId, async (tdb) => {
			const result = await contactsService.softDeleteWithDb(tdb, tenantId, patientId, actor);
			expect(result).toEqual({ id: patientId, deleted: true });});

		await withTenantSession(tenantId, async (tdb) => {
			const list = await contactsService.list(tenantId, { limit: 50 });
			expect(list.items.some((p) => p.id === patientId)).toBe(false);

			await expect(contactsService.get(tenantId, patientId)).rejects.toMatchObject({
				response: { error: { code: 'not_found' } }
			});

			const dups = await contactsService.duplicateGroups(tenantId);
			expect(dups.items.every((g) => g.contacts.every((p) => p.id !== patientId))).toBe(true);

			const dist = await reportsService.contactDistribution(tenantId, {});
			expect(dist.by_status.reduce((n, r) => n + r.count, 0)).toBe(dist.total);

			const still = await tdb
				.select({ deletedAt: contacts.deletedAt })
				.from(contacts)
				.where(eq(contacts.id, patientId));
			expect(still[0]?.deletedAt).not.toBeNull();});

		await expectAuditDelete(tenantId, 'contact', label);
	});

	it('transaction soft-delete: list/finance/report hide + audit + row remains', async () => {
		const title = 'Soft Delete Income';
		let patientId = '';
		let txnId = '';

		await withTenantSession(tenantId, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantId, {
					contact_type_id: contactTypeId,
					first_name: 'Txn Soft Patient'
			});
			patientId = p.id;
			const txn = await transactionsService.createWithDb(tdb, tenantId, {
				kind: 'income',
				title,
				occurred_on: '2026-08-01',
				status: 'paid',
				amount: 2500,
				contact_id: patientId
			});
			txnId = txn.id;});

		await withTenantSession(tenantId, async (tdb) => {
			await transactionsService.softDeleteWithDb(tdb, tenantId, txnId, actor);});

		await withTenantSession(tenantId, async (tdb) => {
			const list = await transactionsService.list(tenantId, { limit: 50 });
			expect(list.items.some((t) => t.id === txnId)).toBe(false);

			const fin = await contactsService.financeSummary(tenantId, patientId);
			expect(fin.income_base).toBe(0);
			expect(fin.transaction_count).toBe(0);

			const summary = await reportsService.summary(tenantId, {
				from: '2026-08-01',
				to: '2026-08-01'
			});
			expect(summary.income_base).toBe(0);

			const row = await tdb
				.select({ deletedAt: transactions.deletedAt })
				.from(transactions)
				.where(eq(transactions.id, txnId));
			expect(row[0]?.deletedAt).not.toBeNull();});

		await expectAuditDelete(tenantId, 'transaction', title);
	});

	it('appointment soft-delete: list hides + audit + row remains', async () => {
		const title = 'Soft Delete Appt';
		let patientId = '';
		let apptId = '';

		await withTenantSession(tenantId, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantId, {
					contact_type_id: contactTypeId,
					first_name: 'Appt Soft Patient'
			});
			patientId = p.id;
			const appt = await appointmentsService.createWithDb(tdb, tenantId, {
				contact_id: patientId,
				title,
				starts_at: '2026-08-10T10:00:00.000Z'
			});
			apptId = appt.id;});

		await withTenantSession(tenantId, async (tdb) => {
			await appointmentsService.softDeleteWithDb(tdb, tenantId, apptId, actor);});

		await withTenantSession(tenantId, async (tdb) => {
			const list = await appointmentsService.list(tenantId, { limit: 50 });
			expect(list.items.some((a) => a.id === apptId)).toBe(false);

			const row = await tdb
				.select({ deletedAt: appointments.deletedAt })
				.from(appointments)
				.where(eq(appointments.id, apptId));
			expect(row[0]?.deletedAt).not.toBeNull();});

		await expectAuditDelete(tenantId, 'appointment', title);
	});

	it('contact soft-delete: list/get/dup hide + audit + row remains', async () => {
		const email = `sd-contact-${randomUUID()}@example.com`;
		const label = 'Soft Delete Contact';
		let contactId = '';

		await withTenantSession(tenantId, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: clinicContactTypeId,
				first_name: label,
				email
			});
			contactId = c.id;
			await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: clinicContactTypeId,
				first_name: `${label} Twin`,
				email
			});});

		await withTenantSession(tenantId, async (tdb) => {
			await contactsService.softDeleteWithDb(tdb, tenantId, contactId, actor);});

		await withTenantSession(tenantId, async (tdb) => {
			const list = await contactsService.list(tenantId, { limit: 50 });
			expect(list.items.some((c) => c.id === contactId)).toBe(false);

			await expect(contactsService.get(tenantId, contactId)).rejects.toMatchObject({
				response: { error: { code: 'not_found' } }
			});

			const dups = await contactsService.duplicateGroups(tenantId);
			expect(dups.items.every((g) => g.contacts.every((c) => c.id !== contactId))).toBe(true);

			const row = await tdb
				.select({ deletedAt: contacts.deletedAt })
				.from(contacts)
				.where(eq(contacts.id, contactId));
			expect(row[0]?.deletedAt).not.toBeNull();});

		await expectAuditDelete(tenantId, 'contact', label);
	});

	it('deleted contact does not appear in balances (policy B)', async () => {
		const label = 'Balance Soft Contact';
		let contactId = '';
		let txnId = '';

		await withTenantSession(tenantId, async (tdb) => {
			const c = await contactsService.createWithDb(tdb, tenantId, {
				contact_type_id: clinicContactTypeId,
				first_name: label
			});
			contactId = c.id;
			const txn = await transactionsService.createWithDb(tdb, tenantId, {
				kind: 'expense',
				title: 'Balance Soft Expense',
				occurred_on: '2026-08-01',
				status: 'unpaid',
				amount: 4000,
				contact_id: contactId,
				contact_label: label
			});
			txnId = txn.id;});

		const before = await reportsService.balances(tenantId);
		expect(before.items.some((row) => row.contact_id === contactId)).toBe(true);

		await withTenantSession(tenantId, async (tdb) => {
			await contactsService.softDeleteWithDb(tdb, tenantId, contactId, actor);});

		const after = await reportsService.balances(tenantId);
		expect(after.items.some((row) => row.contact_id === contactId)).toBe(false);

		// Policy A: transaction itself stays listable (contact was embellishment + label).
		const list = await transactionsService.list(tenantId, { limit: 50 });
		expect(list.items.some((t) => t.id === txnId)).toBe(true);
	});
});
