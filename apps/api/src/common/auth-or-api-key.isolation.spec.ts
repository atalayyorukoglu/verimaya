import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { closeDb, getDb } from '../db/client';
import { generateApiKey } from '../api-keys/api-key-crypto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { SessionGuard } from '../auth/session.guard';
import type { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PatientsService } from '../patients/patients.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { getActiveOrgId } from './active-org.guard';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

type Fixture = {
	tenantA: string;
	tenantB: string;
	keyPlaintextA: string;
	keyPlaintextB: string;
	patientA: string;
	patientB: string;
	guard: AuthOrApiKeyGuard;
	patientsService: PatientsService;
};

function makeContext(req: Partial<FastifyRequest>): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => req,
			getResponse: () => ({})
		})
	} as unknown as ExecutionContext;
}

/**
 * Seed a fresh A/B tenant pair with API keys + one patient each.
 * Tenant-scoped writes use sql.begin + SET LOCAL (is_local=true) so the GUC
 * cannot leak across postgres.js pool connections — unlike session-level
 * set_config(..., false) which caused order-dependent flakes.
 */
async function seedFixture(): Promise<Fixture> {
	process.env.DATABASE_URL = databaseUrl;
	const { sql, db } = getDb(databaseUrl);

	const tenantA = randomUUID();
	const tenantB = randomUUID();

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

	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
		await tx`
			insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
			values (${tenantA}, 'Integration A', ${materialA.prefix}, ${materialA.hash}, ${['read', 'write']})
		`;
	});
	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
		await tx`
			insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
			values (${tenantB}, 'Integration B', ${materialB.prefix}, ${materialB.hash}, ${['read']})
		`;
	});

	const patientA = await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
		const [row] = await tx`
			insert into patients (tenant_id, full_name) values (${tenantA}, 'Patient A') returning id
		`;
		return row!.id as string;
	});
	const patientB = await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
		const [row] = await tx`
			insert into patients (tenant_id, full_name) values (${tenantB}, 'Patient B') returning id
		`;
		return row!.id as string;
	});

	const apiKeyGuard = new ApiKeyGuard({ sql } as unknown as DbService);
	const guard = new AuthOrApiKeyGuard(apiKeyGuard, new SessionGuard());

	// Mirror production TenantContextService: drizzle transaction + SET LOCAL.
	const tenantContext = {
		withTenant: async <T>(id: string, fn: (ctx: { db: typeof db }) => Promise<T>) =>
			db.transaction(async (tx) => {
				await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`);
				return fn({ db: tx as typeof db });
			})
	} as TenantContextService;
	const patientsService = new PatientsService(tenantContext, new LocalFileStorage());

	return {
		tenantA,
		tenantB,
		keyPlaintextA: materialA.plaintext,
		keyPlaintextB: materialB.plaintext,
		patientA,
		patientB,
		guard,
		patientsService
	};
}

async function destroyFixture(fx: Fixture): Promise<void> {
	const { sql } = getDb(databaseUrl);
	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${fx.tenantA}, true)`;
		await tx`delete from patients where tenant_id = ${fx.tenantA}`;
		await tx`delete from api_keys where tenant_id = ${fx.tenantA}`;
	});
	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${fx.tenantB}, true)`;
		await tx`delete from patients where tenant_id = ${fx.tenantB}`;
		await tx`delete from api_keys where tenant_id = ${fx.tenantB}`;
	});
	await sql`delete from tenants where id in (${fx.tenantA}, ${fx.tenantB})`;
	await sql`delete from organization where id in (${fx.tenantA}, ${fx.tenantB})`;
}

describe('AuthOrApiKeyGuard dual-auth tenant isolation', () => {
	let fx: Fixture;

	beforeEach(async () => {
		fx = await seedFixture();
	});

	afterEach(async () => {
		await destroyFixture(fx);
		await closeDb();
	});

	it('resolves Tenant A from its API key and lists only Tenant A patients', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextA}` },
			method: 'GET',
			id: 'req-a'
		} as unknown as FastifyRequest;

		const ok = await fx.guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.tenantId).toBe(fx.tenantA);

		const tenantId = getActiveOrgId(req);
		expect(tenantId).toBe(fx.tenantA);

		const result = await fx.patientsService.list(tenantId, { limit: 10 });
		expect(result.items.map((p) => p.id)).toEqual([fx.patientA]);
		expect(result.items.some((p) => p.id === fx.patientB)).toBe(false);
	});

	it('resolves Tenant B from its API key and lists only Tenant B patients', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextB}` },
			method: 'GET',
			id: 'req-b'
		} as unknown as FastifyRequest;

		const ok = await fx.guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.tenantId).toBe(fx.tenantB);

		const tenantId = getActiveOrgId(req);
		expect(tenantId).toBe(fx.tenantB);

		const result = await fx.patientsService.list(tenantId, { limit: 10 });
		expect(result.items.map((p) => p.id)).toEqual([fx.patientB]);
		expect(result.items.some((p) => p.id === fx.patientA)).toBe(false);
	});

	it('rejects a write request from a read-only API key (missing scope)', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextB}` },
			method: 'POST',
			id: 'req-b-write'
		} as unknown as FastifyRequest;

		await expect(fx.guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows a write request from a read+write API key', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextA}` },
			method: 'POST',
			id: 'req-a-write'
		} as unknown as FastifyRequest;

		const ok = await fx.guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
	});
});
