import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

async function withTenantSession<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
	const { sql } = getDb(databaseUrl);
	await sql`select set_config('app.current_tenant_id', ${tenantId}, false)`;
	try {
		return await fn();
	} finally {
		await sql`select set_config('app.current_tenant_id', '', false)`;
	}
}

function makeContext(req: Partial<FastifyRequest>): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => req,
			getResponse: () => ({})
		})
	} as unknown as ExecutionContext;
}

describe('AuthOrApiKeyGuard dual-auth tenant isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	let keyPlaintextA: string;
	let keyPlaintextB: string;
	let patientA: string;
	let patientB: string;
	let guard: AuthOrApiKeyGuard;
	let patientsService: PatientsService;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { sql, db } = getDb(databaseUrl);

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
		keyPlaintextA = materialA.plaintext;
		keyPlaintextB = materialB.plaintext;

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

		patientA = await withTenantSession(tenantA, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name) values (${tenantA}, 'Patient A') returning id
			`;
			return row!.id as string;
		});
		patientB = await withTenantSession(tenantB, async () => {
			const [row] = await sql`
				insert into patients (tenant_id, full_name) values (${tenantB}, 'Patient B') returning id
			`;
			return row!.id as string;
		});

		const apiKeyGuard = new ApiKeyGuard({ sql } as unknown as DbService);
		guard = new AuthOrApiKeyGuard(apiKeyGuard, new SessionGuard());

		const tenantContext = {
			withTenant: async <T>(id: string, fn: (ctx: { tx: unknown; db: typeof db }) => Promise<T>) =>
				withTenantSession(id, () => fn({ tx: sql, db }))
		} as TenantContextService;
		patientsService = new PatientsService(tenantContext, new LocalFileStorage());
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await withTenantSession(tenantA, async () => {
			await sql`delete from patients where tenant_id = ${tenantA}`;
			await sql`delete from api_keys where tenant_id = ${tenantA}`;
		});
		await withTenantSession(tenantB, async () => {
			await sql`delete from patients where tenant_id = ${tenantB}`;
			await sql`delete from api_keys where tenant_id = ${tenantB}`;
		});
		await sql`delete from tenants where id in (${tenantA}, ${tenantB})`;
		await sql`delete from organization where id in (${tenantA}, ${tenantB})`;
		await closeDb();
	});

	it('resolves Tenant A from its API key and lists only Tenant A patients', async () => {
		const req = {
			headers: { authorization: `Bearer ${keyPlaintextA}` },
			method: 'GET',
			id: 'req-a'
		} as unknown as FastifyRequest;

		const ok = await guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.tenantId).toBe(tenantA);

		const tenantId = getActiveOrgId(req);
		expect(tenantId).toBe(tenantA);

		const result = await patientsService.list(tenantId, { limit: 10 });
		expect(result.items.map((p) => p.id)).toEqual([patientA]);
		expect(result.items.some((p) => p.id === patientB)).toBe(false);
	});

	it('resolves Tenant B from its API key and lists only Tenant B patients', async () => {
		const req = {
			headers: { authorization: `Bearer ${keyPlaintextB}` },
			method: 'GET',
			id: 'req-b'
		} as unknown as FastifyRequest;

		const ok = await guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.tenantId).toBe(tenantB);

		const tenantId = getActiveOrgId(req);
		const result = await patientsService.list(tenantId, { limit: 10 });
		expect(result.items.map((p) => p.id)).toEqual([patientB]);
		expect(result.items.some((p) => p.id === patientA)).toBe(false);
	});

	it('rejects a write request from a read-only API key (missing scope)', async () => {
		const req = {
			headers: { authorization: `Bearer ${keyPlaintextB}` },
			method: 'POST',
			id: 'req-b-write'
		} as unknown as FastifyRequest;

		await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows a write request from a read+write API key', async () => {
		const req = {
			headers: { authorization: `Bearer ${keyPlaintextA}` },
			method: 'POST',
			id: 'req-a-write'
		} as unknown as FastifyRequest;

		const ok = await guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
	});
});
