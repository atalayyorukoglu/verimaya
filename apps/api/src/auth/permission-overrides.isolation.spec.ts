import { BadRequestException, ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { MeService } from '../auth/me.service';
import { PermissionOverridesService } from '../auth/permission-overrides.service';
import { hasOrgPermission } from '../auth/permissions';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { ORG_PERMISSION_METADATA_KEY } from '../common/require-org-permission.decorator';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { TransactionsController } from '../transactions/transactions.controller';
import { purgeTenantFixtures } from '../test/purge-tenant-fixtures';

/**
 * G-11 — tenant permission overrides: isolation, owner lock, no-escalation, API 403.
 * Tenant mock mirrors production: drizzle `db.transaction` + SET LOCAL (is_local=true).
 */

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

class FinanceListTarget {
	list() {}
}

Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'finance', action: 'read' },
	FinanceListTarget.prototype.list
);

function makeContext(req: FastifyRequest, handler: () => unknown, target: object): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => req,
			getResponse: () => ({})
		}),
		getHandler: () => handler,
		getClass: () => target
	} as unknown as ExecutionContext;
}

describe('G-11 tenant permission overrides isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();
	const agentUserA = randomUUID();
	let overrides: PermissionOverridesService;
	let guard: OrgPermissionGuard;

	beforeAll(async () => {
		process.env.DATABASE_URL = databaseUrl;
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${tenantA}, 'Perm A', ${`perm-a-${tenantA.slice(0, 8)}`}, now()),
				(${tenantB}, 'Perm B', ${`perm-b-${tenantB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into tenants (id, name, slug)
			values
				(${tenantA}, 'Perm A', ${`perm-a-${tenantA.slice(0, 8)}`}),
				(${tenantB}, 'Perm B', ${`perm-b-${tenantB.slice(0, 8)}`})
		`;
		await sql`
			insert into "user" (id, name, email)
			values (${agentUserA}, 'Agent A', ${`agent-a-${agentUserA.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values (${tenantA}, ${agentUserA}, 'agent', now())
		`;

		const dbService = { client: db, sql } as unknown as DbService;
		const tenantContext = new TenantContextService(dbService);
		overrides = new PermissionOverridesService(tenantContext);
		guard = new OrgPermissionGuard(
			new Reflector(),
			new MeService(dbService, tenantContext),
			overrides
		);
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${tenantA}, ${tenantB})`;
		await sql`delete from "user" where id = ${agentUserA}`;
		await purgeTenantFixtures(sql, [tenantA, tenantB]);
		await closeDb();
	});

	it('Tenant B cannot read or write Tenant A overrides', async () => {
		await overrides.applyChanges(
			tenantA,
			{
				changes: [{ role: 'agent', resource: 'finance', action: 'read', allowed: false }]
			},
			{ actorId: null, actorDisplayName: 'Actor A' }
		);

		const matrixA = await overrides.getMatrix(tenantA);
		expect(
			matrixA.overrides.some(
				(o) => o.role === 'agent' && o.resource === 'finance' && o.action === 'read'
			)
		).toBe(true);
		expect(matrixA.effective.agent.finance.includes('read')).toBe(false);

		const matrixB = await overrides.getMatrix(tenantB);
		expect(matrixB.overrides).toEqual([]);
		expect(matrixB.effective.agent.finance.includes('read')).toBe(true);

		await overrides.applyChanges(
			tenantB,
			{
				changes: [{ role: 'agent', resource: 'contact', action: 'update', allowed: false }]
			},
			{ actorId: null, actorDisplayName: 'Actor B' }
		);

		const stillA = await overrides.getMatrix(tenantA);
		expect(
			stillA.overrides.some(
				(o) => o.role === 'agent' && o.resource === 'finance' && o.action === 'read'
			)
		).toBe(true);
		expect(
			stillA.overrides.some(
				(o) => o.role === 'agent' && o.resource === 'contact' && o.action === 'update'
			)
		).toBe(false);

		const { sql } = getDb(databaseUrl);
		const logsA = await sql.begin(async (tx) => {
			await tx`select set_config('app.current_tenant_id', ${tenantA}, true)`;
			return tx`
				select entity_label, actor_display_name
				from audit_logs
				where tenant_id = ${tenantA} and entity_label like 'permission_override:%'
			`;
		});
		expect(logsA.length).toBeGreaterThanOrEqual(1);
		expect(logsA.every((r) => r.actor_display_name === 'Actor A')).toBe(true);
	});

	it('rejects owner self-lock on members/settings administration', async () => {
		await expect(
			overrides.applyChanges(
				tenantA,
				{
					changes: [{ role: 'owner', resource: 'members', action: 'update', allowed: false }]
				},
				{ actorId: null, actorDisplayName: 'Actor A' }
			)
		).rejects.toMatchObject({
			response: { error: { code: 'owner_permission_locked' } }
		});

		await expect(
			overrides.applyChanges(
				tenantA,
				{
					changes: [{ role: 'owner', resource: 'settings', action: 'update', allowed: false }]
				},
				{ actorId: null, actorDisplayName: 'Actor A' }
			)
		).rejects.toBeInstanceOf(BadRequestException);
	});

	it('rejects privilege escalation (deny outside code default)', async () => {
		// readonly default has no finance:delete — denying it would be a no-op grant path
		await expect(
			overrides.applyChanges(
				tenantA,
				{
					changes: [{ role: 'readonly', resource: 'finance', action: 'delete', allowed: false }]
				},
				{ actorId: null, actorDisplayName: 'Actor A' }
			)
		).rejects.toMatchObject({
			response: { error: { code: 'override_escalation_rejected' } }
		});
	});

	it('finance:read override yields 403 on finance list via OrgPermissionGuard', async () => {
		await overrides.applyChanges(
			tenantA,
			{
				changes: [{ role: 'agent', resource: 'finance', action: 'read', allowed: false }]
			},
			{ actorId: null, actorDisplayName: 'Actor A' }
		);

		const denied = await overrides.getDeniedKeys(tenantA);
		expect(hasOrgPermission('agent', 'finance', 'read', denied)).toBe(false);

		const req = {
			id: 'g11-finance-403',
			authSession: {
				user: { id: agentUserA },
				session: { activeOrganizationId: tenantA }
			}
		} as unknown as FastifyRequest;

		await expect(
			guard.canActivate(
				makeContext(req, FinanceListTarget.prototype.list, FinanceListTarget)
			)
		).rejects.toMatchObject({
			response: { error: { code: 'insufficient_permission' } }
		});

		// Also assert against the real TransactionsController.list metadata path.
		await expect(
			guard.canActivate(
				makeContext(req, TransactionsController.prototype.list, TransactionsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('reset restores default and allows finance:read again', async () => {
		await overrides.applyChanges(
			tenantA,
			{
				changes: [{ role: 'agent', resource: 'finance', action: 'read', allowed: null }]
			},
			{ actorId: null, actorDisplayName: 'Actor A' }
		);

		const matrix = await overrides.getMatrix(tenantA);
		expect(matrix.effective.agent.finance.includes('read')).toBe(true);

		const req = {
			id: 'g11-finance-ok',
			authSession: {
				user: { id: agentUserA },
				session: { activeOrganizationId: tenantA }
			}
		} as unknown as FastifyRequest;

		await expect(
			guard.canActivate(
				makeContext(req, TransactionsController.prototype.list, TransactionsController)
			)
		).resolves.toBe(true);
	});
});
