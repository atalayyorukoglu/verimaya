import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

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

describe('patient case-notes isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactTypeA: string;
	let contactTypeB: string;
	let patientA: string;
	let patientB: string;
	let noteA: string;
	let noteB: string;
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

		contactsService = new ContactsService(tenantContext, new LocalFileStorage());

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Tenant A', ${`cn-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Tenant B', ${`cn-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Tenant A', ${`cn-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Tenant B', ${`cn-b-${tenantB.slice(0, 8)}`})
		`;

		contactTypeA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0) returning id
			`;
			return row!.id as string;
		});
		contactTypeB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0) returning id
			`;
			return row!.id as string;
		});

		patientA = await withTenantSession(tenantA, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantA, {
				contact_type_id: contactTypeA,
				first_name: 'Note Patient A'
			});
			return p.id;});
		patientB = await withTenantSession(tenantB, async (tdb) => {
			const p = await contactsService.createWithDb(tdb, tenantB, {
				contact_type_id: contactTypeB,
				first_name: 'Note Patient B'
			});
			return p.id;});

		noteA = await withTenantSession(tenantA, async (tdb) => {
			const n = await contactsService.createCaseNoteWithDb(
				tdb,
				tenantA,
				patientA,
				{ body: 'Hello from A' },
				{ displayName: 'Tester A' }
			);
			return n.id;});
		noteB = await withTenantSession(tenantB, async (tdb) => {
			const n = await contactsService.createCaseNoteWithDb(
				tdb,
				tenantB,
				patientB,
				{ body: 'Secret B' },
				{ displayName: 'Tester B' }
			);
			return n.id;});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant A lists only its patient notes', async () => {
		const result = await contactsService.listCaseNotes(tenantA, patientA);
		expect(result.items.map((n) => n.id)).toEqual([noteA]);
		expect(result.items[0]?.body).toBe('Hello from A');
	});

	it('Tenant A cannot list notes for Tenant B patient', async () => {
		await expect(contactsService.listCaseNotes(tenantA, patientB)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("Tenant A cannot delete Tenant B note id under patient A", async () => {
		await withTenantSession(tenantA, async (tdb) => {
			await expect(
				contactsService.deleteCaseNoteWithDb(tdb, patientA, noteB)
			).rejects.toBeInstanceOf(NotFoundException);});
		const stillB = await contactsService.listCaseNotes(tenantB, patientB);
		expect(stillB.items.map((n) => n.id)).toContain(noteB);
	});

	it('Tenant A can delete its own note', async () => {
		await withTenantSession(tenantA, async (tdb) => {
			await expect(contactsService.deleteCaseNoteWithDb(tdb, patientA, noteA)).resolves.toEqual({
				ok: true
			});});
		const empty = await contactsService.listCaseNotes(tenantA, patientA);
		expect(empty.items).toHaveLength(0);
	});
});
