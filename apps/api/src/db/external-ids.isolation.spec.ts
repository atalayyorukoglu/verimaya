import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './client';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('external_ids RLS isolation (Adım 27)', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const internalA = randomUUID();
	const internalB = randomUUID();
	let rowA: string;
	let rowB: string;

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

		rowA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into external_ids (tenant_id, source, entity_type, external_id, internal_id)
				values (${tenantA}, 'legacy_tracker', 'contact', 'case-ext-a', ${internalA})
				returning id
			`;
			return row!.id as string;
		});

		rowB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into external_ids (tenant_id, source, entity_type, external_id, internal_id)
				values (${tenantB}, 'legacy_tracker', 'contact', 'case-ext-b', ${internalB})
				returning id
			`;
			return row!.id as string;
		});
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from external_ids where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from external_ids where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A cannot read Tenant B external_ids under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id, external_id from external_ids`;
		});

		expect(rows.map((r) => r.id)).toEqual([rowA]);
		expect(rows.some((r) => r.id === rowB)).toBe(false);
	});

	it('Tenant B cannot read Tenant A external_ids under SET LOCAL', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`select id from external_ids`;
		});

		expect(rows.map((r) => r.id)).toEqual([rowB]);
		expect(rows.some((r) => r.id === rowA)).toBe(false);
	});

	it('Tenant A cannot read a specific Tenant B row by id', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from external_ids where id = ${rowB}`;
		});

		expect(rows).toHaveLength(0);
	});

	it('Tenant A cannot insert a row for Tenant B (WITH CHECK)', async () => {
		const { sql } = getDb(databaseUrl);

		await expect(
			sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
				await tx`
					insert into external_ids (tenant_id, source, entity_type, external_id, internal_id)
					values (${tenantB}, 'legacy_tracker', 'contact', 'cross-tenant', ${randomUUID()})
				`;
			})
		).rejects.toThrow();
	});
});
