import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { closeDb, getDb } from '../db/client';
import { DbService } from '../db/db.service';
import { MeService } from '../auth/me.service';
import { OrgPermissionGuard } from './org-permission.guard';
import { ORG_PERMISSION_METADATA_KEY } from './require-org-permission.decorator';

const databaseUrl =
	process.env.DATABASE_URL_APP ??
	process.env.DATABASE_URL ??
	'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';

class PermissionTarget {
	updatePatient() {}

	updateFinance() {}

	deleteFinance() {}
}

class UnprotectedTarget {
	endpoint() {}
}

Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'contact', action: 'update' },
	PermissionTarget.prototype.updatePatient
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'finance', action: 'update' },
	PermissionTarget.prototype.updateFinance
);
Reflect.defineMetadata(
	ORG_PERMISSION_METADATA_KEY,
	{ resource: 'finance', action: 'delete' },
	PermissionTarget.prototype.deleteFinance
);

function makeContext(
	req: FastifyRequest,
	handler: () => void,
	target: object = PermissionTarget
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

function sessionRequest(userId: string, organizationId: string): FastifyRequest {
	return {
		id: `request-${userId}`,
		authSession: {
			user: { id: userId },
			session: { activeOrganizationId: organizationId }
		}
	} as unknown as FastifyRequest;
}

describe('OrgPermissionGuard', () => {
	const organizationA = randomUUID();
	const organizationB = randomUUID();
	const ownerUser = randomUUID();
	const adminUser = randomUUID();
	const readonlyUser = randomUUID();
	const financeUser = randomUUID();
	const agentUser = randomUUID();
	const managerUser = randomUUID();
	const crossOrganizationUser = randomUUID();
	const unknownRoleUser = randomUUID();
	let guard: OrgPermissionGuard;

	beforeAll(async () => {
		const { db, sql } = getDb(databaseUrl);

		await sql`
			insert into organization (id, name, slug, created_at)
			values
				(${organizationA}, 'Organization A', ${`permission-a-${organizationA.slice(0, 8)}`}, now()),
				(${organizationB}, 'Organization B', ${`permission-b-${organizationB.slice(0, 8)}`}, now())
		`;
		await sql`
			insert into "user" (id, name, email)
			values
				(${ownerUser}, 'Owner', ${`owner-${ownerUser.slice(0, 8)}@example.com`}),
				(${adminUser}, 'Admin', ${`admin-${adminUser.slice(0, 8)}@example.com`}),
				(${readonlyUser}, 'Readonly', ${`readonly-${readonlyUser.slice(0, 8)}@example.com`}),
				(${financeUser}, 'Finance', ${`finance-${financeUser.slice(0, 8)}@example.com`}),
				(${agentUser}, 'Agent', ${`agent-${agentUser.slice(0, 8)}@example.com`}),
				(${managerUser}, 'Manager', ${`manager-${managerUser.slice(0, 8)}@example.com`}),
				(${crossOrganizationUser}, 'Cross Organization', ${`cross-${crossOrganizationUser.slice(0, 8)}@example.com`}),
				(${unknownRoleUser}, 'Unknown Role', ${`unknown-${unknownRoleUser.slice(0, 8)}@example.com`})
		`;
		await sql`
			insert into member (organization_id, user_id, role, created_at)
			values
				(${organizationA}, ${ownerUser}, 'owner', now()),
				(${organizationA}, ${adminUser}, 'admin', now()),
				(${organizationA}, ${readonlyUser}, 'readonly', now()),
				(${organizationA}, ${financeUser}, 'finance', now()),
				(${organizationA}, ${agentUser}, 'agent', now()),
				(${organizationA}, ${managerUser}, 'manager', now()),
				(${organizationB}, ${crossOrganizationUser}, 'admin', now()),
				(${organizationA}, ${unknownRoleUser}, 'unknown_role', now())
		`;

		guard = new OrgPermissionGuard(new Reflector(), new MeService({ client: db } as DbService));
	});

	afterAll(async () => {
		const { sql } = getDb(databaseUrl);
		await sql`delete from member where organization_id in (${organizationA}, ${organizationB})`;
		await sql`
			delete from "user"
			where id in (
				${ownerUser},
				${adminUser},
				${readonlyUser},
				${financeUser},
				${agentUser},
				${managerUser},
				${crossOrganizationUser},
				${unknownRoleUser}
			)
		`;
		await sql`delete from organization where id in (${organizationA}, ${organizationB})`;
		await closeDb();
	});

	it('allows owner and admin', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(ownerUser, organizationA), PermissionTarget.prototype.updatePatient)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(adminUser, organizationA), PermissionTarget.prototype.updatePatient)
			)
		).resolves.toBe(true);
	});

	it('rejects readonly mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(readonlyUser, organizationA), PermissionTarget.prototype.updatePatient)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects finance users from patient mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(financeUser, organizationA), PermissionTarget.prototype.updatePatient)
			)
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_permission' } } });
	});

	it('rejects agents from finance mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(agentUser, organizationA), PermissionTarget.prototype.updateFinance)
			)
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_permission' } } });
	});

	it('rejects managers from finance deletes', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(managerUser, organizationA), PermissionTarget.prototype.deleteFinance)
			)
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_permission' } } });
	});

	it('does not use membership from another organization', async () => {
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest(crossOrganizationUser, organizationA),
					PermissionTarget.prototype.updatePatient
				)
			)
		).rejects.toMatchObject({ response: { error: { code: 'organization_membership_required' } } });
	});

	it('rejects unknown stored roles fail-closed', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest(unknownRoleUser, organizationA), PermissionTarget.prototype.updatePatient)
			)
		).rejects.toMatchObject({ response: { error: { code: 'organization_membership_required' } } });
	});

	it('fails closed when permission metadata is missing', async () => {
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest(ownerUser, organizationA),
					UnprotectedTarget.prototype.endpoint,
					UnprotectedTarget
				)
			)
		).rejects.toMatchObject({ response: { error: { code: 'insufficient_permission' } } });
	});

	it('allows API-key-authenticated requests without resolving an organization role', async () => {
		const req = {
			id: 'request-api-key',
			apiKeyAuth: {
				tenantId: organizationA,
				apiKeyId: randomUUID(),
				scopes: ['read']
			}
		} as unknown as FastifyRequest;

		await expect(
			guard.canActivate(makeContext(req, PermissionTarget.prototype.updatePatient))
		).resolves.toBe(true);
	});
});
