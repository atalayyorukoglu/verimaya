import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { generateApiKey, hashApiKey } from './api-key-crypto';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('api_keys RLS isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let keyA: string;
	let keyB: string;

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

		const materialA = generateApiKey();
		const materialB = generateApiKey();

		keyA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values (${tenantA}, 'Integration A', ${materialA.prefix}, ${materialA.hash}, ${['read']})
				returning id
			`;
			return row!.id as string;
		});

		keyB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values (${tenantB}, 'Integration B', ${materialB.prefix}, ${materialB.hash}, ${['read', 'write']})
				returning id
			`;
			return row!.id as string;
		});

		expect(hashApiKey(materialA.plaintext)).toBe(materialA.hash);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			await tx`delete from api_keys where tenant_id = ${tenantA}`;
		});
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			await tx`delete from api_keys where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('Tenant A lists only its own active API keys', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select id, name, key_hash
				from api_keys
				where revoked_at is null
				order by created_at desc
			`;
		});

		expect(rows.map((r) => r.id)).toEqual([keyA]);
		expect(rows.some((r) => r.id === keyB)).toBe(false);
		expect(rows.every((r) => typeof r.key_hash === 'string')).toBe(true);
	});

	it('Tenant B lists only its own active API keys', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			return tx`
				select id, name, key_hash
				from api_keys
				where revoked_at is null
				order by created_at desc
			`;
		});

		expect(rows.map((r) => r.id)).toEqual([keyB]);
		expect(rows.some((r) => r.id === keyA)).toBe(false);
	});

	it('Tenant A cannot read Tenant B API key by id', async () => {
		const { sql } = getDb(databaseUrl);

		const rows = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`select id from api_keys where id = ${keyB}`;
		});

		expect(rows).toHaveLength(0);
	});
});
