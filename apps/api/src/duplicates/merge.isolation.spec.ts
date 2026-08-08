import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import postgres from 'postgres';
import { findContactDuplicateGroups, findPatientDuplicateGroups } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { appointments } from '../db/schema/appointments';
import { transactions } from '../db/schema/transactions';
import { contacts } from '../db/schema/contacts';
import { patients } from '../db/schema/patients';
import { toContact, toPatient } from '../common/mappers';
import { ContactsService } from '../contacts/contacts.service';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService } from '../tenant/tenant-context.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const adminDatabaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://verimaya:verimaya@localhost:5433/verimaya';

const actor = { actorId: null, actorDisplayName: 'Test Actor' };

/** Session-scoped tenant for service calls in tests (RLS reads app.current_tenant_id). */
async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('duplicate merge isolation (patients empty-file + contacts FK)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;

	let patientsService: PatientsService;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;

		const admin = postgres(adminDatabaseUrl, { max: 1 });
		await admin`
			alter table audit_logs drop constraint if exists audit_logs_entity_type_chk
		`;
		await admin`
			alter table audit_logs add constraint audit_logs_entity_type_chk check ("entity_type" in (
				'patient', 'contact', 'appointment', 'transaction', 'inbound_message', 'file', 'tenant', 'user'
			))
		`;
		await admin.end();

		patientsService = new PatientsService({} as TenantContextService, new LocalFileStorage());
		contactsService = new ContactsService({} as TenantContextService);

		const { sql } = getDb(databaseUrl);
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

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name)
				values (${tenantA}, 'Clinic')
				returning id
			`;
			return row!.id as string;
		});

		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name)
				values (${tenantB}, 'Clinic')
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		for (const tenantId of [tenantA, tenantB]) {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
				await tx`delete from audit_logs where tenant_id = ${tenantId}`;
				await tx`delete from files where tenant_id = ${tenantId}`;
				await tx`delete from case_notes where tenant_id = ${tenantId}`;
				await tx`delete from transactions where tenant_id = ${tenantId}`;
				await tx`delete from appointments where tenant_id = ${tenantId}`;
				await tx`delete from patients where tenant_id = ${tenantId}`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('patient duplicate-groups only returns same-tenant matches', async () => {
		const email = `dup-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);

		await withTenantSession(tenantA, async () => {
			await patientsService.createWithDb(db, tenantA, {
				full_name: 'Ali Yilmaz',
				email
			});
			await patientsService.createWithDb(db, tenantA, {
				full_name: 'Ali Y.',
				email
			});
		});

		await withTenantSession(tenantB, async () => {
			await patientsService.createWithDb(db, tenantB, {
				full_name: 'Tenant B Ali',
				email
			});
		});

		const rowsA = await withTenantSession(tenantA, async () =>
			db.select().from(patients).where(isNull(patients.deletedAt))
		);
		const rowsB = await withTenantSession(tenantB, async () =>
			db.select().from(patients).where(isNull(patients.deletedAt))
		);

		const groupsA = findPatientDuplicateGroups(rowsA.map(toPatient));
		const groupsB = findPatientDuplicateGroups(rowsB.map(toPatient));

		expect(groupsA.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
		expect(groupsA.every((g) => g.patients.every((p) => p.tenant_id === tenantA))).toBe(true);
		expect(groupsB.some((g) => g.match_type === 'email')).toBe(false);
	});

	it('Tenant A patient merge cannot touch Tenant B records', async () => {
		const email = `merge-iso-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepA = '';
		let keepB = '';

		await withTenantSession(tenantA, async () => {
			const a = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Keep A',
				email
			});
			keepA = a.id;
		});

		await withTenantSession(tenantB, async () => {
			const b = await patientsService.createWithDb(db, tenantB, {
				full_name: 'Keep B',
				email
			});
			keepB = b.id;
		});

		await expect(
			withTenantSession(tenantA, async () =>
				patientsService.mergeWithDb(
					db,
					tenantA,
					{ keep_id: keepA, merge_ids: [keepB] },
					actor
				)
			)
		).rejects.toBeInstanceOf(NotFoundException);

		const stillThere = await withTenantSession(tenantB, async () =>
			db
				.select({ id: patients.id })
				.from(patients)
				.where(and(eq(patients.id, keepB), isNull(patients.deletedAt)))
		);
		expect(stillThere).toHaveLength(1);
	});

	it('patient merge with appointment returns 409 patient_has_records', async () => {
		const email = `merge-appt-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepId = '';
		let loserId = '';

		await withTenantSession(tenantA, async () => {
			const keep = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Empty Keep',
				email
			});
			const loser = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Busy Loser',
				email
			});
			keepId = keep.id;
			loserId = loser.id;

			await db.insert(appointments).values({
				tenantId: tenantA,
				patientId: loserId,
				patientDisplayName: loser.full_name,
				startsAt: new Date('2026-08-01T10:00:00Z')
			});
		});

		await expect(
			withTenantSession(tenantA, async () =>
				patientsService.mergeWithDb(
					db,
					tenantA,
					{ keep_id: keepId, merge_ids: [loserId] },
					actor
				)
			)
		).rejects.toMatchObject({
			response: { error: { code: 'patient_has_records' } }
		});

		const active = await withTenantSession(tenantA, async () =>
			db
				.select({ id: patients.id })
				.from(patients)
				.where(and(eq(patients.id, loserId), isNull(patients.deletedAt)))
		);
		expect(active).toHaveLength(1);
	});

	it('patient merge with transaction returns 409 patient_has_records', async () => {
		const email = `merge-txn-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepId = '';
		let loserId = '';

		await withTenantSession(tenantA, async () => {
			const keep = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Empty Keep Txn',
				email
			});
			const loser = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Busy Loser Txn',
				email
			});
			keepId = keep.id;
			loserId = loser.id;

			await db.insert(transactions).values({
				tenantId: tenantA,
				kind: 'income',
				title: 'Patient payment',
				occurredOn: '2026-07-01',
				status: 'paid',
				amount: 5000,
				patientId: loserId,
				patientDisplayName: loser.full_name
			});
		});

		await expect(
			withTenantSession(tenantA, async () =>
				patientsService.mergeWithDb(
					db,
					tenantA,
					{ keep_id: keepId, merge_ids: [loserId] },
					actor
				)
			)
		).rejects.toMatchObject({
			response: { error: { code: 'patient_has_records' } }
		});
	});

	it('empty patient merge fills phone+email and soft-deletes source', async () => {
		const { db } = getDb(databaseUrl);
		let keepId = '';
		let sourceId = '';

		await withTenantSession(tenantA, async () => {
			const keep = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Empty Cover',
				phone: '+905551112233'
			});
			const source = await patientsService.createWithDb(db, tenantA, {
				full_name: 'Empty Cover',
				email: `empty-merge-${randomUUID()}@example.com`
			});
			keepId = keep.id;
			sourceId = source.id;
		});

		const merged = await withTenantSession(tenantA, async () =>
			patientsService.mergeWithDb(
				db,
				tenantA,
				{ keep_id: keepId, merge_ids: [sourceId] },
				actor
			)
		);

		expect(merged.id).toBe(keepId);
		expect(merged.phone).toBe('+905551112233');
		expect(merged.email).toContain('@example.com');

		const deleted = await withTenantSession(tenantA, async () =>
			db.select({ deletedAt: patients.deletedAt }).from(patients).where(eq(patients.id, sourceId))
		);
		expect(deleted[0]?.deletedAt).not.toBeNull();
	});

	it('patient merge with different contact_ids returns 409 patient_contact_mismatch', async () => {
		const email = `merge-contact-mismatch-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepId = '';
		let sourceId = '';

		await withTenantSession(tenantA, async () => {
			const c1 = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Person One',
				email: `c1-${randomUUID()}@example.com`
			});
			const c2 = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Person Two',
				email: `c2-${randomUUID()}@example.com`
			});
			const keep = await patientsService.createWithDb(db, tenantA, {
				full_name: 'File One',
				email,
				contact_id: c1.id
			});
			const source = await patientsService.createWithDb(db, tenantA, {
				full_name: 'File Two',
				email,
				contact_id: c2.id
			});
			keepId = keep.id;
			sourceId = source.id;
		});

		await expect(
			withTenantSession(tenantA, async () =>
				patientsService.mergeWithDb(
					db,
					tenantA,
					{ keep_id: keepId, merge_ids: [sourceId] },
					actor
				)
			)
		).rejects.toMatchObject({
			response: { error: { code: 'patient_contact_mismatch' } }
		});
	});

	it('contact merge reassigns transactions and hard-deletes losers', async () => {
		const email = `contact-merge-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepId = '';
		let loserId = '';
		let transactionId = '';

		await withTenantSession(tenantA, async () => {
			const keep = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Winner Contact',
				email
			});
			const loser = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Loser Contact',
				email
			});
			keepId = keep.id;
			loserId = loser.id;

			const [txn] = await db
				.insert(transactions)
				.values({
					tenantId: tenantA,
					kind: 'expense',
					title: 'Test expense',
					occurredOn: '2026-07-01',
					status: 'paid',
					amount: 1000,
					contactId: loserId,
					contactLabel: loser.display_name
				})
				.returning({ id: transactions.id });
			transactionId = txn!.id;
		});

		await withTenantSession(tenantA, async () => {
			await contactsService.mergeWithDb(
				db,
				tenantA,
				{ keep_id: keepId, merge_ids: [loserId] },
				actor
			);
		});

		const txn = await withTenantSession(tenantA, async () =>
			db
				.select({
					contactId: transactions.contactId,
					contactLabel: transactions.contactLabel
				})
				.from(transactions)
				.where(eq(transactions.id, transactionId))
		);
		expect(txn[0]?.contactId).toBe(keepId);
		expect(txn[0]?.contactLabel).toBe('Winner Contact');

		const gone = await withTenantSession(tenantA, async () =>
			db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, loserId))
		);
		expect(gone).toHaveLength(0);
	});

	it('Tenant A contact merge cannot touch Tenant B records', async () => {
		const email = `contact-iso-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);
		let keepA = '';
		let keepB = '';

		await withTenantSession(tenantA, async () => {
			const a = await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Contact A',
				email
			});
			keepA = a.id;
		});

		await withTenantSession(tenantB, async () => {
			const b = await contactsService.createWithDb(db, tenantB, {
				contact_type_id: contactTypeB,
				display_name: 'Contact B',
				email
			});
			keepB = b.id;
		});

		await expect(
			withTenantSession(tenantA, async () =>
				contactsService.mergeWithDb(
					db,
					tenantA,
					{ keep_id: keepA, merge_ids: [keepB] },
					actor
				)
			)
		).rejects.toBeInstanceOf(NotFoundException);

		const stillThere = await withTenantSession(tenantB, async () =>
			db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, keepB))
		);
		expect(stillThere).toHaveLength(1);
	});

	it('contact duplicate-groups only returns same-tenant matches', async () => {
		const email = `contact-dup-${randomUUID()}@example.com`;
		const { db } = getDb(databaseUrl);

		await withTenantSession(tenantA, async () => {
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Dr. A',
				email
			});
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Dr A',
				email
			});
		});

		const rowsA = await withTenantSession(tenantA, async () => db.select().from(contacts));
		const groups = findContactDuplicateGroups(rowsA.map(toContact));

		expect(groups.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
		expect(groups.every((g) => g.contacts.every((c) => c.tenant_id === tenantA))).toBe(true);
	});
});
