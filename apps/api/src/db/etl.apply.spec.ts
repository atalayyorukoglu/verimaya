import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './client';

const require = createRequire(import.meta.url);
const {
	applyLayer1,
	attachContactLegacy,
	loadFixtureFile,
	mapFixture,
	DEFAULT_FIXTURE
} = require('../../scripts/etl.js') as {
	applyLayer1: (
		sql: unknown,
		tenantId: string,
		mapped: unknown,
		batchSize: number
	) => Promise<{
		contacts: { inserted: number; skipped: number };
		patients: { inserted: number; skipped: number };
		errors: string[];
	}>;
	attachContactLegacy: (mapped: unknown, source: unknown) => unknown;
	loadFixtureFile: (path: string) => unknown;
	mapFixture: (source: unknown, tenantId: string) => {
		contacts: unknown[];
		patients: unknown[];
	};
	DEFAULT_FIXTURE: string;
};

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const fixturePath = path.resolve(path.dirname(DEFAULT_FIXTURE), 'etl-sample.json');

describe('ETL apply layer 1 (Adım 28)', () => {
	const tenantId = randomUUID();
	let sql: ReturnType<typeof getDb>['sql'];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		({ sql } = getDb(databaseUrl));

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'ETL Tenant', ${`etl-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'ETL Tenant', ${`etl-${tenantId.slice(0, 8)}`})
		`;
	});

	afterAll(async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from patients where tenant_id = ${tenantId}`;
			await tx`delete from contacts where tenant_id = ${tenantId}`;
			await tx`delete from external_ids where tenant_id = ${tenantId}`;
			await tx`delete from finance_categories where tenant_id = ${tenantId}`;
			await tx`delete from contact_types where tenant_id = ${tenantId}`;
			await tx`delete from tenant_settings where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('applies fixture contacts/patients then second run inserts 0', async () => {
		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, tenantId), source) as {
			contacts: unknown[];
			patients: unknown[];
		};

		const first = await applyLayer1(sql, tenantId, mapped, 1000);
		expect(first.contacts.inserted).toBe(mapped.contacts.length);
		expect(first.patients.inserted).toBe(mapped.patients.length);
		expect(first.contacts.skipped).toBe(0);
		expect(first.patients.skipped).toBe(0);

		const counts = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [c] = await tx`select count(*)::int as n from contacts`;
			const [p] = await tx`select count(*)::int as n from patients`;
			const [e] = await tx`select count(*)::int as n from external_ids`;
			return { contacts: c!.n as number, patients: p!.n as number, external: e!.n as number };
		});

		expect(counts.contacts).toBe(mapped.contacts.length);
		expect(counts.patients).toBe(mapped.patients.length);
		expect(counts.external).toBe(mapped.contacts.length + mapped.patients.length);

		const second = await applyLayer1(sql, tenantId, mapped, 1000);
		expect(second.contacts.inserted).toBe(0);
		expect(second.patients.inserted).toBe(0);
		expect(second.contacts.skipped).toBe(mapped.contacts.length);
		expect(second.patients.skipped).toBe(mapped.patients.length);

		const link = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			return tx`
				select p.full_name, c.display_name
				from patients p
				left join contacts c on c.id = p.contact_id
				where p.full_name = 'Atalay Demir'
			`;
		});
		expect(link).toHaveLength(1);
		expect(link[0]!.display_name).toBe('Atalay Demir');
	});
});
