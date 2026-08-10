import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { LocalFileStorage } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';

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

describe('files RLS isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let patientA: string;
	let patientB: string;
	let fileA: string;
	let fileB: string;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql, db } = getDb(databaseUrl);

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

		patientA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'Patient A', 'Patient A'
				)
				returning id`;
			return row!.id as string;
		});

		patientB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'Patient B', 'Patient B'
				)
				returning id`;
			return row!.id as string;
		});

		fileA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into files (tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status)
				values (${tenantA}, ${patientA}, 'a.pdf', 'application/pdf', 0, 'local://pending', 'ready')
				returning id
			`;
			return row!.id as string;
		});

		fileB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const storageKey = `local://${tenantB}/${patientB}/${randomUUID()}`;
			const [row] = await tx`
				insert into files (tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status)
				values (${tenantB}, ${patientB}, 'b.pdf', 'application/pdf', 4, ${storageKey}, 'pending')
				returning id
			`;
			return row!.id as string;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, () => fn({ tx: sql, db }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from files where tenant_id = ${tenantA}`;
			await tx`delete from contacts where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from files where tenant_id = ${tenantB}`;
			await tx`delete from contacts where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot read Tenant B files under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from files`;
		});

		expect(rows.map((r) => r.id)).toEqual([fileA]);
		expect(rows.some((r) => r.id === fileB)).toBe(false);
	});

	it('Tenant B cannot read a specific Tenant A file by id', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from files where id = ${fileA}`;
		});

		expect(rows).toHaveLength(0);
	});

	it('Tenant A cannot confirm or PUT content for Tenant B pending file', async () => {
		await expect(contactsService.confirmFile(tenantA, patientB, fileB)).rejects.toBeInstanceOf(
			NotFoundException
		);
		await expect(
			contactsService.putFileContent(tenantA, patientB, fileB, Buffer.from('test'))
		).rejects.toBeInstanceOf(NotFoundException);
	});
});
