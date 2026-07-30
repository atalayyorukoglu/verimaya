import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from './client';

const require = createRequire(import.meta.url);
const {
	applyAll,
	attachContactLegacy,
	loadFixtureFile,
	mapFixture,
	DEFAULT_FIXTURE
} = require('../../scripts/etl.js') as {
	applyAll: (
		sql: unknown,
		tenantId: string,
		mapped: unknown,
		batchSize: number
	) => Promise<unknown>;
	attachContactLegacy: (mapped: unknown, source: unknown) => unknown;
	loadFixtureFile: (path: string) => unknown;
	mapFixture: (source: unknown, tenantId: string) => unknown;
	DEFAULT_FIXTURE: string;
};

const { verifyEtl } = require('../../scripts/etl-verify.js') as {
	verifyEtl: (opts: {
		sql: unknown;
		tenantId: string;
		source: unknown;
		sourceLabel: string;
	}) => Promise<{ failed: { check: string }[]; diffs: { ok: boolean }[] }>;
};

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

const fixturePath = path.resolve(path.dirname(DEFAULT_FIXTURE), 'etl-sample.json');

describe('ETL verify (Adım 30)', () => {
	const tenantId = randomUUID();
	let sql: ReturnType<typeof getDb>['sql'];

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		({ sql } = getDb(databaseUrl));

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'ETL Verify', ${`etlv-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'ETL Verify', ${`etlv-${tenantId.slice(0, 8)}`})
		`;

		const source = loadFixtureFile(fixturePath);
		const mapped = attachContactLegacy(mapFixture(source, tenantId), source);
		await applyAll(sql, tenantId, mapped, 1000);
	});

	afterAll(async () => {
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from case_notes where tenant_id = ${tenantId}`;
			await tx`delete from files where tenant_id = ${tenantId}`;
			await tx`delete from transactions where tenant_id = ${tenantId}`;
			await tx`delete from appointments where tenant_id = ${tenantId}`;
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

	it('verify reports zero out-of-tolerance diffs after apply', async () => {
		const source = loadFixtureFile(fixturePath);
		const result = await verifyEtl({
			sql,
			tenantId,
			source,
			sourceLabel: fixturePath
		});
		expect(result.failed).toEqual([]);
		expect(result.diffs.every((d) => d.ok)).toBe(true);
	});
});
