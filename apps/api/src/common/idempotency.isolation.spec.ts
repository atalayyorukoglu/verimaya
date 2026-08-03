/**
 * IDEM-01 (Faz 4.1): apps/api/src/common/idempotency.service.ts — replay identity is now
 * tenant_id + key + method + normalized_path (previously the lookup only ever checked `key`,
 * so a key reused on a different endpoint replayed the wrong endpoint's response). Also covers
 * the concurrent-duplicate race (two requests with the identical identity racing the
 * select-then-insert) being caught and replayed gracefully instead of surfacing a raw 500.
 *
 * Requires real Postgres (RLS + the tenant+key+method+normalized_path unique index). Same
 * harness as approve-drafts.isolation.spec.ts.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { IdempotencyService } from './idempotency.service';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

describe('IDEM-01: idempotency key replay identity (tenant + key + method + normalized_path)', () => {
	const tenantId = randomUUID();
	let idempotency: IdempotencyService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Idem01', ${`idem01-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Idem01', ${`idem01-${tenantId.slice(0, 8)}`})
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		idempotency = new IdempotencyService(tenantContext);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from idempotency_keys where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it('same key + same method + same path replays the first response without re-running the handler', async () => {
		const key = `idem01-${randomUUID()}`;
		let calls = 0;
		const handler = async () => {
			calls++;
			return { statusCode: 201, body: { call: calls } };
		};

		const first = await idempotency.run(tenantId, key, 'POST', '/v1/widgets', handler);
		const second = await idempotency.run(tenantId, key, 'POST', '/v1/widgets', handler);

		expect(first.replayed).toBe(false);
		expect(second.replayed).toBe(true);
		expect(second.body).toEqual(first.body);
		expect(calls).toBe(1);
	});

	it('same key, different normalized_path (same method) does NOT replay — the bug this step fixes', async () => {
		const key = `idem01-${randomUUID()}`;
		let calls = 0;
		const handler = async () => {
			calls++;
			return { statusCode: 201, body: { call: calls } };
		};

		const first = await idempotency.run(tenantId, key, 'POST', '/v1/widgets', handler);
		const second = await idempotency.run(tenantId, key, 'POST', '/v1/gadgets', handler);

		expect(first.replayed).toBe(false);
		expect(second.replayed).toBe(false); // NOT a replay of /v1/widgets' response
		expect(second.body).toEqual({ call: 2 });
		expect(calls).toBe(2);
	});

	it('same key, different method (same path) does NOT replay', async () => {
		const key = `idem01-${randomUUID()}`;
		let calls = 0;
		const handler = async () => {
			calls++;
			return { statusCode: 200, body: { call: calls } };
		};

		const first = await idempotency.run(tenantId, key, 'PATCH', '/v1/widgets/:id', handler);
		const second = await idempotency.run(tenantId, key, 'DELETE', '/v1/widgets/:id', handler);

		expect(first.replayed).toBe(false);
		expect(second.replayed).toBe(false);
		expect(second.body).toEqual({ call: 2 });
		expect(calls).toBe(2);
	});

	it('different tenant, identical key + method + path — each tenant gets its own run (RLS)', async () => {
		const otherTenantId = randomUUID();
		const { sql } = getDb(databaseUrl);
		await sql`
			insert into organization (id, name, slug, created_at)
			values (${otherTenantId}, 'Idem01 B', ${`idem01b-${otherTenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${otherTenantId}, 'Idem01 B', ${`idem01b-${otherTenantId.slice(0, 8)}`})
		`;

		try {
			const key = `idem01-${randomUUID()}`;
			let calls = 0;
			const handler = async () => {
				calls++;
				return { statusCode: 201, body: { call: calls } };
			};

			const a = await idempotency.run(tenantId, key, 'POST', '/v1/shared-key-path', handler);
			const b = await idempotency.run(otherTenantId, key, 'POST', '/v1/shared-key-path', handler);

			expect(a.replayed).toBe(false);
			expect(b.replayed).toBe(false);
			expect(calls).toBe(2);
		} finally {
			await sql.begin(async (tx) => {
				await tx`select set_config('app.current_tenant_id', ${otherTenantId}, true)`;
				await tx`delete from idempotency_keys where tenant_id = ${otherTenantId}`;
			});
			await sql`delete from tenants where id = ${otherTenantId}`;
			await sql`delete from organization where id = ${otherTenantId}`;
		}
	});

	it('concurrent requests with the identical tenant+key+method+path race safely — one handler run, no 500', async () => {
		const key = `idem01-race-${randomUUID()}`;
		let calls = 0;
		const handler = async () => {
			calls++;
			// Widen the race window: hold the transaction open briefly so both concurrent calls
			// are guaranteed to pass the "not found" select before either commits its insert —
			// this is what forces the unique-index conflict the catch block in
			// idempotency.service.ts exists to handle gracefully instead of surfacing a 500.
			await new Promise((resolve) => setTimeout(resolve, 50));
			return { statusCode: 201, body: { call: calls } };
		};

		const [a, b] = await Promise.all([
			idempotency.run(tenantId, key, 'POST', '/v1/race', handler),
			idempotency.run(tenantId, key, 'POST', '/v1/race', handler)
		]);

		expect(calls).toBe(1);
		expect(a.body).toEqual(b.body);
		expect([a.replayed, b.replayed].sort()).toEqual([false, true]);

		const { sql } = getDb(databaseUrl);
		const count = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			const [row] = await tx`
				select count(*)::int as n from idempotency_keys where tenant_id = ${tenantId} and key = ${key}
			`;
			return row!.n as number;
		});
		expect(count).toBe(1);
	});
});
