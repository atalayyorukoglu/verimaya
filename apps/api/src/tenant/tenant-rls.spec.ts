import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('tenant RLS isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let noteA: string;
	let noteB: string;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
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

		noteA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into demo_notes (tenant_id, body)
				values (${tenantA}, 'secret-a')
				returning id
			`;
			return row!.id as string;
		});

		noteB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into demo_notes (tenant_id, body)
				values (${tenantB}, 'secret-b')
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

	it('Tenant A cannot read Tenant B demo_notes under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const result = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const cfg = await tx`
				select current_setting('app.current_tenant_id', true) as v, app.current_tenant_id() as tid
			`;
			const rows = await tx`select id from demo_notes`;
			return { cfg, rows };
		});

		expect(result.cfg[0]?.tid).toBe(tenantA);
		expect(result.rows.map((r) => r.id)).toEqual([noteA]);
		expect(result.rows.some((r) => r.id === noteB)).toBe(false);
	});

	it('Tenant B cannot read Tenant A demo_notes under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from demo_notes`;
		});

		expect(rows.map((r) => r.id)).toEqual([noteB]);
		expect(rows.some((r) => r.id === noteA)).toBe(false);
	});
});
