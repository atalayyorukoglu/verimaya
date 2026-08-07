import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { PatientsService } from './patients.service';

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

describe('patient case-notes isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let noteA: string;
	let noteB: string;
	let patientsService: PatientsService;
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

		patientsService = new PatientsService(tenantContext, new LocalFileStorage());

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

		patientA = await withTenantSession(tenantA, async () => {
			const p = await patientsService.createWithDb(db, tenantA, { full_name: 'Note Patient A' });
			return p.id;
		});
		patientB = await withTenantSession(tenantB, async () => {
			const p = await patientsService.createWithDb(db, tenantB, { full_name: 'Note Patient B' });
			return p.id;
		});

		noteA = await withTenantSession(tenantA, async () => {
			const n = await patientsService.createCaseNoteWithDb(
				db,
				tenantA,
				patientA,
				{ body: 'Hello from A' },
				{ displayName: 'Tester A' }
			);
			return n.id;
		});
		noteB = await withTenantSession(tenantB, async () => {
			const n = await patientsService.createCaseNoteWithDb(
				db,
				tenantB,
				patientB,
				{ body: 'Secret B' },
				{ displayName: 'Tester B' }
			);
			return n.id;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from case_notes where tenant_id = ${tenantA}`;
			await sql`delete from patients where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from case_notes where tenant_id = ${tenantB}`;
			await sql`delete from patients where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its patient notes', async () => {
		const result = await patientsService.listCaseNotes(tenantA, patientA);
		expect(result.items.map((n) => n.id)).toEqual([noteA]);
		expect(result.items[0]?.body).toBe('Hello from A');
	});

	it('Tenant A cannot list notes for Tenant B patient', async () => {
		await expect(patientsService.listCaseNotes(tenantA, patientB)).rejects.toBeInstanceOf(
			NotFoundException
		);
	});

	it("Tenant A cannot delete Tenant B note id under patient A", async () => {
		await withTenantSession(tenantA, async () => {
			await expect(
				patientsService.deleteCaseNoteWithDb(db, patientA, noteB)
			).rejects.toBeInstanceOf(NotFoundException);
		});
		const stillB = await patientsService.listCaseNotes(tenantB, patientB);
		expect(stillB.items.map((n) => n.id)).toContain(noteB);
	});

	it('Tenant A can delete its own note', async () => {
		await withTenantSession(tenantA, async () => {
			await expect(patientsService.deleteCaseNoteWithDb(db, patientA, noteA)).resolves.toEqual({
				ok: true
			});
		});
		const empty = await patientsService.listCaseNotes(tenantA, patientA);
		expect(empty.items).toHaveLength(0);
	});
});
