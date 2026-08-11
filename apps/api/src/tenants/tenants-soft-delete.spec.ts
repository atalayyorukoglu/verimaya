import { ForbiddenException } from '@nestjs/common';
import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TenantsService } from './tenants.service';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * AUDIT-F09-06: soft-delete tenants + ON DELETE restrict on tenant FKs.
 * Org hard-delete is disabled at better-auth (`disableOrganizationDeletion`);
 * physical DELETE of a tenant that still has children must fail.
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('AUDIT-F09-06 tenants soft-delete + FK restrict', () => {
	const tenantId = randomUUID();
	let contactTypeId: string;
	let tenantContext: TenantContextService;
	let tenantsService: TenantsService;
	let sql: ReturnType<typeof getDb>['sql'];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const db = getDb(databaseUrl);
		sql = db.sql;

		const dbService = {
			sql: db.sql,
			client: db.db
		} as DbService;
		tenantContext = new TenantContextService(dbService);
		tenantsService = new TenantsService(tenantContext);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'SoftDel', ${`softdel-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'SoftDel', ${`softdel-${tenantId.slice(0, 8)}`})
		`;
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				insert into contact_types (tenant_id, name, sort_order)
				values (${tenantId}, 'Hasta', 0) returning id
			`;
			contactTypeId = row!.id as string;
		});
	});

	afterAll(async () => {
		await purgeTenantFixtures(sql, [tenantId]);
		await closeDb();
	});

	it('rejects hard DELETE of a tenant that still has child rows (restrict)', async () => {
		await expect(
			sql`delete from tenants where id = ${tenantId}`
		).rejects.toThrow(/restrict|foreign key|violates/i);
	});

	it('rejects hard DELETE of organization while tenant row exists (restrict bridge)', async () => {
		await expect(
			sql`delete from organization where id = ${tenantId}`
		).rejects.toThrow(/restrict|foreign key|violates/i);
	});

	it('soft-deletes the tenant and blocks ActiveOrg access via assertTenantActive', async () => {
		await tenantsService.softDelete(tenantId, {
			actorId: null,
			actorDisplayName: 'test'
		});

		const [row] = await sql<{ deleted_at: Date | null }[]>`
			select deleted_at from tenants where id = ${tenantId}
		`;
		expect(row?.deleted_at).not.toBeNull();

		await expect(tenantContext.assertTenantActive(tenantId, 'req-test')).rejects.toBeInstanceOf(
			ForbiddenException
		);

		// Child data remains (retention)
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const rows = await tx`
				select id from contact_types where id = ${contactTypeId}
			`;
			expect(rows.length).toBe(1);
		});
	});

	it('still rejects organization DELETE after tenant soft-delete (row remains)', async () => {
		await expect(
			sql`delete from organization where id = ${tenantId}`
		).rejects.toThrow(/restrict|foreign key|violates/i);
	});
});
