import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { findContactDuplicateGroups } from '@verimaya/shared';
import { closeDb, getDb } from '../db/client';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { toContact } from '../common/mappers';
import { contacts } from '../db/schema/contacts';
import { and, asc, isNull , sql as drizzleSql} from 'drizzle-orm';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

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

describe('AUDIT-F09-17 duplicate-scan cap', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let hastaTypeA: string;
	let contactsService: ContactsService;

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
		const { sql } = dbHandle;

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { db: TenantDb }) => Promise<T>) =>
				withTenantSession(id, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

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
		hastaTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantA}, 'Hasta', 0)
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('contacts under cap: truncated false and groups match full scan', async () => {
		const email = `under-${randomUUID()}@example.com`;
		await withTenantSession(tenantA, async (tdb) => {
			await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Under Cap One',
				email
			});
			await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Under Cap Two',
				email
			});});

		const result = await contactsService.duplicateGroups(tenantA);
		expect(result.truncated).toBe(false);
		expect(result.scanned_count).toBeGreaterThanOrEqual(2);

		const rows = await withTenantSession(tenantA, async (tdb) =>
			tdb
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
		await withTenantSession(tenantA, async (tdb) => {
			await contactsService.createWithDb(tdb, tenantA, {
					contact_type_id: contactTypeA,
					first_name: 'Pat Under One',
				email
			});
			await contactsService.createWithDb(tdb, tenantA, {
					contact_type_id: contactTypeA,
					first_name: 'Pat Under Two',
				email
			});});

		const result = await contactsService.duplicateGroups(tenantA);
		expect(result.truncated).toBe(false);
		expect(result.scanned_count).toBeGreaterThanOrEqual(2);

		const rows = await withTenantSession(tenantA, async (tdb) =>
			tdb
				.select()
				.from(contacts)
				.where(isNull(contacts.deletedAt))
				.orderBy(asc(contacts.createdAt), asc(contacts.id))
		);
		expect(result.items).toEqual(findContactDuplicateGroups(rows.map(toContact)));
		expect(result.items.some((g) => g.match_type === 'email' && g.label === email)).toBe(true);
	});

	it('patients over cap: truncated true, scanned_count === override', async () => {
		const prefix = `pat-over-${randomUUID().slice(0, 8)}`;
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			for (let i = 0; i < 5; i++) {
				await tx`
					insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name, email)
					values (
						${tenantA},
						${hastaTypeA},
						'Hasta',
						${`${prefix} ${i}`},
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

	it('patients deterministic order: two calls return same items', async () => {
		const a = await contactsService.duplicateGroups(tenantA, 4);
		const b = await contactsService.duplicateGroups(tenantA, 4);
		expect(a.items).toEqual(b.items);
		expect(a.scanned_count).toBe(b.scanned_count);
		expect(a.truncated).toBe(b.truncated);
	});

	it('tenant isolation: Tenant A scan does not include Tenant B contact ids', async () => {
		const email = `iso-${randomUUID()}@example.com`;
		await withTenantSession(tenantA, async (tdb) => {
			await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Iso A1',
				email
			});
			await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Iso A2',
				email
			});});
		await withTenantSession(tenantB, async (tdb) => {
			await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Iso B1',
				email
			});
			await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Iso B2',
				email
			});});

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
