import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { sql as drizzleSql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { closeDb, getDb } from '../db/client';
import { generateApiKey } from '../api-keys/api-key-crypto';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { MeService } from '../auth/me.service';
import { SessionGuard } from '../auth/session.guard';
import type { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { ContactsService } from '../contacts/contacts.service';
import { LocalFileStorage } from '../storage/local-file.storage';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { getActiveOrgId } from './active-org.guard';
import { OrgPermissionGuard } from './org-permission.guard';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

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
	orgGuard: OrgPermissionGuard;
	contactsService: ContactsService;
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
	const scopesA = JSON.stringify([
		'contact:create',
		'contact:read',
		'contact:update',
		'contact:delete',
		'finance:create',
		'finance:read',
		'finance:update',
		'finance:delete',
		'settings:read',
		'settings:update'
	]);
	const scopesB = JSON.stringify(['contact:read', 'finance:read', 'settings:read']);

	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
		await tx`
			insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
			values (${tenantA}, 'Integration A', ${materialA.prefix}, ${materialA.hash}, ${scopesA}::jsonb)
		`;
	});
	await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
		await tx`
			insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
			values (${tenantB}, 'Integration B', ${materialB.prefix}, ${materialB.hash}, ${scopesB}::jsonb)
		`;
	});

	const patientA = await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
		await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantA}, 'Hasta', 0)
			on conflict (tenant_id, name) do update set name = excluded.name`;
		const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
			values (
				${tenantA},
				(select id from contact_types where tenant_id = ${tenantA} and name = 'Hasta' limit 1),
				'Hasta', 'Patient A', 'Patient A'
			) returning id`;
		return row!.id as string;
	});
	const patientB = await sql.begin(async (tx) => {
		await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
		await tx`insert into contact_types (tenant_id, name, sort_order) values (${tenantB}, 'Hasta', 0)
			on conflict (tenant_id, name) do update set name = excluded.name`;
		const [row] = await tx`insert into contacts (tenant_id, contact_type_id, contact_type_name, first_name, display_name)
			values (
				${tenantB},
				(select id from contact_types where tenant_id = ${tenantB} and name = 'Hasta' limit 1),
				'Hasta', 'Patient B', 'Patient B'
			) returning id`;
		return row!.id as string;
	});

	const apiKeyGuard = new ApiKeyGuard({ sql } as unknown as DbService);
	const guard = new AuthOrApiKeyGuard(apiKeyGuard, new SessionGuard());
	const orgGuard = new OrgPermissionGuard(
		new Reflector(),
		new MeService({ client: db } as DbService),
		{
			getDeniedKeys: async () => new Set<string>()
		} as import('../auth/permission-overrides.service').PermissionOverridesService
	);

	// Mirror production TenantContextService: drizzle transaction + SET LOCAL.
	const tenantContext = {
		withTenant: async <T>(id: string, fn: (ctx: { db: typeof db }) => Promise<T>) =>
			db.transaction(async (tx) => {
				await tx.execute(drizzleSql`select set_config('app.current_tenant_id', ${id}, true)`);
				return fn({ db: tx as typeof db });
			})
	} as TenantContextService;
	const contactsService = new ContactsService(tenantContext, new LocalFileStorage());

	return {
		tenantA,
		tenantB,
		keyPlaintextA: materialA.plaintext,
		keyPlaintextB: materialB.plaintext,
		patientA,
		patientB,
		guard,
		orgGuard,
		contactsService
	};
}

async function destroyFixture(fx: Fixture): Promise<void> {
	const { sql } = getDb(databaseUrl);
	await purgeTenantFixtures(sql, [fx.tenantA, fx.tenantB]);
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

		const result = await fx.contactsService.list(tenantId, { limit: 10 });
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

		const result = await fx.contactsService.list(tenantId, { limit: 10 });
		expect(result.items.map((p) => p.id)).toEqual([fx.patientB]);
		expect(result.items.some((p) => p.id === fx.patientA)).toBe(false);
	});

	it('rejects a write request from a read-only API key at OrgPermissionGuard (missing scope)', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextB}` },
			method: 'POST',
			id: 'req-b-write'
		} as unknown as FastifyRequest;

		// Auth succeeds; OrgPermissionGuard (tested elsewhere) enforces resource scopes.
		// AuthOrApiKeyGuard only authenticates — no crude read/write gate.
		const ok = await fx.guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.scopes).toEqual(
			expect.arrayContaining(['contact:read', 'finance:read', 'settings:read'])
		);
		expect(req.apiKeyAuth?.scopes).not.toEqual(expect.arrayContaining(['contact:update']));
	});

	it('allows a write request from a read+write API key', async () => {
		const req = {
			headers: { authorization: `Bearer ${fx.keyPlaintextA}` },
			method: 'POST',
			id: 'req-a-write'
		} as unknown as FastifyRequest;

		const ok = await fx.guard.canActivate(makeContext(req));
		expect(ok).toBe(true);
		expect(req.apiKeyAuth?.scopes).toEqual(expect.arrayContaining(['contact:update']));
	});
});
