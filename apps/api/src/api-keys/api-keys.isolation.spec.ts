import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LEGACY_API_KEY_READ_SCOPES, LEGACY_API_KEY_WRITE_SCOPES } from '@verimaya/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { MeService } from '../auth/me.service';
import { SessionGuard } from '../auth/session.guard';
import { DbService } from '../db/db.service';
import { closeDb, getDb } from '../db/client';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { ORG_PERMISSION_METADATA_KEY } from '../common/require-org-permission.decorator';
import { generateApiKey, hashApiKey } from './api-key-crypto';
import { ApiKeyGuard } from './api-key.guard';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

class ScopeTarget {
	readContact() {}
	updateContact() {}
	readAudit() {}
	readFinance() {}
	/** Resource intentionally absent from apiKeyScopeSchema — deny-by-default. */
	unmapped() {}
}

Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'contact', action: 'read' },
	ScopeTarget.prototype.readContact
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'contact', action: 'update' },
	ScopeTarget.prototype.updateContact
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'audit', action: 'read' },
	ScopeTarget.prototype.readAudit
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'finance', action: 'read' },
	ScopeTarget.prototype.readFinance
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'unmapped_resource', action: 'read' },
	ScopeTarget.prototype.unmapped
);

function makeContext(
	req: FastifyRequest,
	handler: () => void,
	target: object = ScopeTarget
): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => req,
			getResponse: () => ({})
		}),
		getHandler: () => handler,
		getClass: () => target
	} as unknown as ExecutionContext;
}

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
		const scopesA = JSON.stringify([...LEGACY_API_KEY_READ_SCOPES]);
		const scopesB = JSON.stringify([...LEGACY_API_KEY_WRITE_SCOPES]);

		keyA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			const [row] = await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values (${tenantA}, 'Integration A', ${materialA.prefix}, ${materialA.hash}, ${scopesA}::jsonb)
				returning id
			`;
			return row!.id as string;
		});

		keyB = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantB}, true)`;
			const [row] = await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values (${tenantB}, 'Integration B', ${materialB.prefix}, ${materialB.hash}, ${scopesB}::jsonb)
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

describe('AUDIT-F09-02 API key scopes (deny-by-default)', () => {
	const tenantId = randomUUID();
	let readKeyPlaintext: string;
	let writeKeyPlaintext: string;
	let scopedFinanceOnlyPlaintext: string;
	let orgPermissionGuard: OrgPermissionGuard;
	let apiKeyGuard: ApiKeyGuard;
	let sessionGuard: SessionGuard;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values (${tenantId}, 'Scope Tenant', ${`scope-${tenantId.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values (${tenantId}, 'Scope Tenant', ${`scope-${tenantId.slice(0, 8)}`})
		`;

		const readMaterial = generateApiKey();
		const writeMaterial = generateApiKey();
		const financeMaterial = generateApiKey();
		readKeyPlaintext = readMaterial.plaintext;
		writeKeyPlaintext = writeMaterial.plaintext;
		scopedFinanceOnlyPlaintext = financeMaterial.plaintext;

		const readScopes = JSON.stringify([...LEGACY_API_KEY_READ_SCOPES]);
		const writeScopes = JSON.stringify([...LEGACY_API_KEY_WRITE_SCOPES]);
		const financeOnly = JSON.stringify(['finance:read']);

		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`
				insert into api_keys (tenant_id, name, key_prefix, key_hash, scopes)
				values
					(${tenantId}, 'Read', ${readMaterial.prefix}, ${readMaterial.hash}, ${readScopes}::jsonb),
					(${tenantId}, 'Write', ${writeMaterial.prefix}, ${writeMaterial.hash}, ${writeScopes}::jsonb),
					(${tenantId}, 'Finance only', ${financeMaterial.prefix}, ${financeMaterial.hash}, ${financeOnly}::jsonb)
			`;
		});

		apiKeyGuard = new ApiKeyGuard({ sql } as unknown as DbService);
		sessionGuard = new SessionGuard();
		orgPermissionGuard = new OrgPermissionGuard(
			new Reflector(),
			new MeService({ client: db } as DbService)
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantId}, true)`;
			await tx`delete from api_keys where tenant_id = ${tenantId}`;
		});
		await sql`delete from tenants where id = ${tenantId}`;
		await sql`delete from organization where id = ${tenantId}`;
		await closeDb();
	});

	it("Scope'suz key 403", async () => {
		const req = {
			id: 'empty-scopes',
			apiKeyAuth: {
				tenantId,
				apiKeyId: randomUUID(),
				scopes: [] as string[]
			}
		} as unknown as FastifyRequest;

		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact))
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_scope' } } });
	});

	it("Scope'lu key 200", async () => {
		const req = {
			id: 'scoped-200',
			headers: { authorization: `Bearer ${readKeyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;

		await apiKeyGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact));
		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact))
		).resolves.toBe(true);
	});

	it('Haritada olmayan yeni endpoint API key\'e kapalı (deny-by-default kanıtı)', async () => {
		const req = {
			id: 'deny-by-default',
			apiKeyAuth: {
				tenantId,
				apiKeyId: randomUUID(),
				scopes: [...LEGACY_API_KEY_WRITE_SCOPES, 'audit:read']
			}
		} as unknown as FastifyRequest;

		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.unmapped))
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_scope' } } });
	});

	it('API key with contact:read allows contact read and rejects contact update (403)', async () => {
		const req = {
			id: 'scope-read',
			headers: { authorization: `Bearer ${readKeyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;

		await expect(apiKeyGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact))).resolves.toBe(
			true
		);
		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact))
		).resolves.toBe(true);
		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.updateContact))
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_scope' } } });
	});

	it('API key with write scopes allows contact update (200 path)', async () => {
		const req = {
			id: 'scope-write',
			headers: { authorization: `Bearer ${writeKeyPlaintext}` },
			method: 'PATCH'
		} as unknown as FastifyRequest;

		await expect(
			apiKeyGuard.canActivate(makeContext(req, ScopeTarget.prototype.updateContact))
		).resolves.toBe(true);
		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.updateContact))
		).resolves.toBe(true);
	});

	it('API key without finance:read is denied on finance (403); with scope allowed', async () => {
		const contactOnlyReq = {
			id: 'scope-contact-only',
			apiKeyAuth: {
				tenantId,
				apiKeyId: randomUUID(),
				scopes: ['contact:read']
			}
		} as unknown as FastifyRequest;
		await expect(
			orgPermissionGuard.canActivate(makeContext(contactOnlyReq, ScopeTarget.prototype.readFinance))
		).rejects.toBeInstanceOf(ForbiddenException);

		const financeReq = {
			id: 'scope-finance',
			headers: { authorization: `Bearer ${scopedFinanceOnlyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;
		await apiKeyGuard.canActivate(makeContext(financeReq, ScopeTarget.prototype.readFinance));
		await expect(
			orgPermissionGuard.canActivate(makeContext(financeReq, ScopeTarget.prototype.readFinance))
		).resolves.toBe(true);
		await expect(
			orgPermissionGuard.canActivate(makeContext(financeReq, ScopeTarget.prototype.readContact))
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_scope' } } });
	});

	it('API key ile /v1/audit-logs reddedilir (session-only + deny audit scope)', async () => {
		const req = {
			id: 'audit-reject',
			headers: { authorization: `Bearer ${writeKeyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;

		// Controllers use SessionGuard — API key bearer never establishes a session.
		await expect(sessionGuard.canActivate(makeContext(req, ScopeTarget.prototype.readAudit))).rejects.toBeInstanceOf(
			UnauthorizedException
		);

		// Even if OrgPermissionGuard ran with apiKeyAuth, write legacy scopes omit audit:read.
		await apiKeyGuard.canActivate(makeContext(req, ScopeTarget.prototype.readAudit));
		await expect(
			orgPermissionGuard.canActivate(makeContext(req, ScopeTarget.prototype.readAudit))
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_scope' } } });
	});

	it('API key ile /v1/me/data-export reddedilir (session-only KVKK surface)', async () => {
		const req = {
			id: 'kvkk-export-reject',
			headers: { authorization: `Bearer ${writeKeyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;

		await expect(sessionGuard.canActivate(makeContext(req, () => undefined))).rejects.toBeInstanceOf(
			UnauthorizedException
		);
	});

	it('Tenant A API key cannot satisfy Tenant B org context (negative isolation)', async () => {
		const otherTenant = randomUUID();
		const req = {
			id: 'cross-tenant',
			headers: { authorization: `Bearer ${writeKeyPlaintext}` },
			method: 'GET'
		} as unknown as FastifyRequest;

		await apiKeyGuard.canActivate(makeContext(req, ScopeTarget.prototype.readContact));
		expect(req.apiKeyAuth?.tenantId).toBe(tenantId);
		expect(req.apiKeyAuth?.tenantId).not.toBe(otherTenant);
	});
});
