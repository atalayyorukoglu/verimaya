import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../db/client';
import { tenants } from '../db/schema';
import { DbService } from '../db/db.service';
import { TenantContextService } from './tenant-context.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya:verimaya@localhost:5433/verimaya';

describe('TenantContextService.withTenant (real drizzle transaction)', () => {
	let tenantContext: TenantContextService;
	const tenantId = randomUUID();

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		process.env.DATABASE_URL_APP = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, ${`ctx-${tenantId.slice(0, 8)}`}, ${`ctx-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, ${`ctx-${tenantId.slice(0, 8)}`}, ${`ctx-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		tenantContext = new TenantContextService(dbService);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('sets tenant and can query via drizzle tx', async () => {
		const rows = await tenantContext.withTenant(tenantId, async ({ db }) =>
			db.select().from(tenants).where(eq(tenants.id, tenantId))
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(tenantId);
	});
});
