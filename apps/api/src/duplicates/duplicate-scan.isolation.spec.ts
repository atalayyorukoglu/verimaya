import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { findContactDuplicateGroups, findPatientDuplicateGroups } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { toContact, toPatient } from '../common/mappers';
import { contacts } from '../db/schema/contacts';
import { patients } from '../db/schema/patients';
import { and, asc, isNull } from 'drizzle-orm';

/**
 * AUDIT-F09-17: duplicate-groups scan row cap + truncated envelope
 * (contacts + patients). Cap override is a method param (not env).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const adminDatabaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://verimaya:verimaya@localhost:5433/verimaya';

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

describe('AUDIT-F09-17 duplicate-scan cap', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let contactsService: ContactsService;
	let patientsService: PatientsService;
	let db: TenantDb;

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

		const dbHandle = getDb(databaseUrl);
		db = dbHandle.db;
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, () => fn({ db }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext);
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Dup Cap A', ${`dup-cap-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Dup Cap B', ${`dup-cap-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Dup Cap A', ${`dup-cap-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Dup Cap B', ${`dup-cap-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Klinik', 0)
				returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantB}, 'Klinik', 0)
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
				await tx`delete from patients where tenant_id = ${tenantId}`;
				await tx`delete from contacts where tenant_id = ${tenantId}`;
				await tx`delete from contact_types where tenant_id = ${tenantId}`;
			});
		}
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('contacts under cap: truncated false and groups match full scan', async () => {
		const email = `under-${randomUUID()}@example.com`;
		await withTenantSession(tenantA, async () => {
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Under Cap One',
				email
			});
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Under Cap Two',
				email
			});
		});

		const result = await contactsService.duplicateGroups(tenantA);
		expect(result.truncated).toBe(false);
		expect(result.scanned_count).toBeGreaterThanOrEqual(2);

		const rows = await withTenantSession(tenantA, async () =>
			db
				.select()
				.from(contacts)
				.where(and(isNull(contacts.deletedAt)))
				.orderBy(asc(contacts.createdAt), asc(contacts.id))
		);
		expect(result.items).toEqual(findContactDuplicateGroups(rows.map(toContact)));
		expect(result.items.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
	});

	it('contacts over cap: truncated true, scanned_count === override', async () => {
		const prefix = `over-${randomUUID().slice(0, 8)}`;
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			for (let i = 0; i < 5; i++) {
				await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, display_name, email)
					values (
						${tenantA},
						${contactTypeA},
						'Klinik',
						${`${prefix} ${i}`},
						${`${prefix}-${i}@example.com`}
					)
				`;
			}
		});

		const cap = 3;
		const result = await contactsService.duplicateGroups(tenantA, cap);
		expect(result.truncated).toBe(true);
		expect(result.scanned_count).toBe(cap);
	});

	it('contacts deterministic order: two calls return same items', async () => {
		const a = await contactsService.duplicateGroups(tenantA, 4);
		const b = await contactsService.duplicateGroups(tenantA, 4);
		expect(a.items).toEqual(b.items);
		expect(a.scanned_count).toBe(b.scanned_count);
		expect(a.truncated).toBe(b.truncated);
	});

	it('patients under cap: truncated false and groups match empty-cover full scan', async () => {
		const email = `pat-under-${randomUUID()}@example.com`;
		await withTenantSession(tenantA, async () => {
			await patientsService.createWithDb(db, tenantA, {
				full_name: 'Pat Under One',
				email
			});
			await patientsService.createWithDb(db, tenantA, {
				full_name: 'Pat Under Two',
				email
			});
		});

		const result = await patientsService.duplicateGroups(tenantA);
		expect(result.truncated).toBe(false);
		expect(result.scanned_count).toBeGreaterThanOrEqual(2);

		const rows = await withTenantSession(tenantA, async () =>
			db
				.select()
				.from(patients)
				.where(isNull(patients.deletedAt))
				.orderBy(asc(patients.createdAt), asc(patients.id))
		);
		expect(result.items).toEqual(findPatientDuplicateGroups(rows.map(toPatient)));
		expect(result.items.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
	});

	it('patients over cap: truncated true, scanned_count === override', async () => {
		const prefix = `pat-over-${randomUUID().slice(0, 8)}`;
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			for (let i = 0; i < 5; i++) {
				await tx`
					insert into patients (tenant_id, full_name, email)
					values (
						${tenantA},
						${`${prefix} ${i}`},
						${`${prefix}-${i}@example.com`}
					)
				`;
			}
		});

		const cap = 3;
		const result = await patientsService.duplicateGroups(tenantA, cap);
		expect(result.truncated).toBe(true);
		expect(result.scanned_count).toBe(cap);
	});

	it('patients deterministic order: two calls return same items', async () => {
		const a = await patientsService.duplicateGroups(tenantA, 4);
		const b = await patientsService.duplicateGroups(tenantA, 4);
		expect(a.items).toEqual(b.items);
		expect(a.scanned_count).toBe(b.scanned_count);
		expect(a.truncated).toBe(b.truncated);
	});

	it('tenant isolation: Tenant A scan does not include Tenant B contact ids', async () => {
		const email = `iso-${randomUUID()}@example.com`;
		await withTenantSession(tenantA, async () => {
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Iso A1',
				email
			});
			await contactsService.createWithDb(db, tenantA, {
				contact_type_id: contactTypeA,
				display_name: 'Iso A2',
				email
			});
		});
		await withTenantSession(tenantB, async () => {
			await contactsService.createWithDb(db, tenantB, {
				contact_type_id: contactTypeB,
				display_name: 'Iso B1',
				email
			});
			await contactsService.createWithDb(db, tenantB, {
				contact_type_id: contactTypeB,
				display_name: 'Iso B2',
				email
			});
		});

		const groupsA = await contactsService.duplicateGroups(tenantA);
		const groupsB = await contactsService.duplicateGroups(tenantB);

		expect(groupsA.items.every((g) => g.contacts.every((c) => c.tenant_id === tenantA))).toBe(
			true
		);
		expect(groupsB.items.every((g) => g.contacts.every((c) => c.tenant_id === tenantB))).toBe(
			true
		);
		expect(groupsA.items.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
		expect(groupsB.items.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
	});
});
