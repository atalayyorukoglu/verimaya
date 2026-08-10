import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import postgres from 'postgres';
import { closeDb, getDb } from '../db/client';
import { files } from '../db/schema/files';
import { LocalFileStorage, getUploadDir } from '../storage/local-file.storage';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { ContactsService } from './contacts.service';

/**
 * GAP-F09-23: soft-delete contact files — hide from list/preview/download,
 * audit delete, tenant isolation, second delete → 404. Blob not removed.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const adminDatabaseUrl =
	process.env.DATABASE_URL ?? 'postgresql://verimaya:verimaya@localhost:5433/verimaya';

const actor = { actorId: null, actorDisplayName: 'GapF09-23 SoftDeleteFile' };

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

describe('GAP-F09-23 contact file soft-delete', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let contactA: string;
	let contactB: string;
	let fileA: string;
	let fileB: string;
	let fileAKey: string;
	let storage: LocalFileStorage;
	let contactsService: ContactsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		storage = new LocalFileStorage();

		const { sql, db } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'FileSD Tenant A', ${`fsd-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'FileSD Tenant B', ${`fsd-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'FileSD Tenant A', ${`fsd-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'FileSD Tenant B', ${`fsd-b-${tenantB.slice(0, 8)}`})
		`;

		contactA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantA},
					(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
					'Hasta', 'FileSD A', 'FileSD A'
				)
				returning id`;
			return row!.id as string;
		});

		contactB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
				on conflict (tenant_id, name) do update set name = excluded.name`;
			const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
				values (
					${tenantB},
					(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
					'Hasta', 'FileSD B', 'FileSD B'
				)
				returning id`;
			return row!.id as string;
		});

		fileA = randomUUID();
		fileB = randomUUID();
		fileAKey = storage.buildKey(tenantA, contactA, fileA);
		const fileBKey = storage.buildKey(tenantB, contactB, fileB);

		const absA = path.join(getUploadDir(), tenantA, contactA);
		await mkdir(absA, { recursive: true });
		await writeFile(path.join(absA, fileA), Buffer.from('%PDF-1.4 soft-delete-fixture'));

		const absB = path.join(getUploadDir(), tenantB, contactB);
		await mkdir(absB, { recursive: true });
		await writeFile(path.join(absB, fileB), Buffer.from('%PDF-1.4 tenant-b'));

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`
				insert into files (
					id, tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status
				) values (
					${fileA}, ${tenantA}, ${contactA}, 'kvkk-doc.pdf', 'application/pdf',
					28, ${fileAKey}, 'ready'
				)
			`;
		});

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`
				insert into files (
					id, tenant_id, contact_id, filename, mime_type, size_bytes, storage_key, status
				) values (
					${fileB}, ${tenantB}, ${contactB}, 'b-secret.pdf', 'application/pdf',
					16, ${fileBKey}, 'ready'
				)
			`;
		});

		const tenantContext = {
			withTenant: async <T>(
				tenantId: string,
				fn: (ctx: { db: typeof db }) => Promise<T>
			) => withTenantSession(tenantId, (tdb) => fn({ db: tdb }))
		} as TenantContextService;

		contactsService = new ContactsService(tenantContext, storage);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from audit_logs where tenant_id = ${tenantA}`;
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

	it('Tenant A cannot soft-delete Tenant B file (404)', async () => {
		await expect(
			withTenantSession(tenantA, (tdb) =>
				contactsService.softDeleteFileWithDb(tdb, tenantA, contactB, fileB, actor)
			)
		).rejects.toBeInstanceOf(NotFoundException);
	});

	it('soft-delete hides from list and preview/download; audit written; blob kept', async () => {
		const result = await withTenantSession(tenantA, (tdb) =>
			contactsService.softDeleteFileWithDb(tdb, tenantA, contactA, fileA, actor)
		);
		expect(result).toEqual({ id: fileA, deleted: true });

		const listed = await contactsService.listFiles(tenantA, contactA);
		expect(listed.items.map((f) => f.id)).not.toContain(fileA);

		await expect(
			contactsService.openFilePreview(tenantA, contactA, fileA)
		).rejects.toBeInstanceOf(NotFoundException);
		await expect(
			contactsService.openFileDownload(tenantA, contactA, fileA)
		).rejects.toBeInstanceOf(NotFoundException);

		expect(await storage.exists(fileAKey)).toBe(true);

		const admin = postgres(adminDatabaseUrl, { max: 1 });
		try {
			const auditRows = await admin`
				select action, entity_type, entity_label
				from audit_logs
				where tenant_id = ${tenantA}::uuid
					and action = 'delete'
					and entity_type = 'file'
					and entity_label = 'kvkk-doc.pdf'
			`;
			expect(auditRows.length).toBeGreaterThan(0);

			const fileRows = await admin`
				select deleted_at from files where id = ${fileA}::uuid
			`;
			expect(fileRows).toHaveLength(1);
			expect(fileRows[0]!.deleted_at).not.toBeNull();
		} finally {
			await admin.end();
		}
	});

	it('second soft-delete returns 404 (idempotency: natural delete is not-found)', async () => {
		await expect(
			withTenantSession(tenantA, (tdb) =>
				contactsService.softDeleteFileWithDb(tdb, tenantA, contactA, fileA, actor)
			)
		).rejects.toBeInstanceOf(NotFoundException);

		const remaining = await withTenantSession(tenantA, async (tdb) => {
			return tdb
				.select({ id: files.id, deletedAt: files.deletedAt })
				.from(files)
				.where(eq(files.id, fileA));
		});
		expect(remaining).toHaveLength(1);
		expect(remaining[0]!.deletedAt).not.toBeNull();
	});
});
