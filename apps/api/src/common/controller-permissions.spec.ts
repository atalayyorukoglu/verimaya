import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { MeService } from '../auth/me.service';
import { SessionGuard } from '../auth/session.guard';
import { SettingsController } from '../settings/settings.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { ActiveOrgGuard } from './active-org.guard';
import { AuthOrApiKeyGuard } from './auth-or-api-key.guard';
import { OrgPermissionGuard } from './org-permission.guard';
import {
	ORG_PERMISSION_METADATA_KEY,
	type OrgPermissionRequirement
} from './require-org-permission.decorator';

const transactionPermissions: Array<
	[keyof TransactionsController, OrgPermissionRequirement]
> = [
	['list', { resource: 'finance', action: 'read' }],
	['create', { resource: 'finance', action: 'create' }],
	['update', { resource: 'finance', action: 'update' }]
];

const settingsPermissions: Array<[keyof SettingsController, OrgPermissionRequirement]> = [
	['listFinanceCategories', { resource: 'settings', action: 'read' }],
	['createFinanceCategory', { resource: 'settings', action: 'update' }],
	['updateFinanceCategory', { resource: 'settings', action: 'update' }],
	['removeFinanceCategory', { resource: 'settings', action: 'update' }],
	['listContactTypes', { resource: 'settings', action: 'read' }],
	['createContactType', { resource: 'settings', action: 'update' }],
	['removeContactType', { resource: 'settings', action: 'update' }],
	['listAppointmentTypes', { resource: 'settings', action: 'read' }],
	['getCredential', { resource: 'settings', action: 'read' }],
	['putCredential', { resource: 'settings', action: 'update' }],
	['getTrustScore', { resource: 'settings', action: 'read' }],
	['putTrustScore', { resource: 'settings', action: 'update' }],
	['getAiDisclosure', { resource: 'settings', action: 'read' }],
	['putAiDisclosure', { resource: 'settings', action: 'update' }]
];

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

function sessionRequest(userId: string): FastifyRequest {
	return {
		id: `request-${userId}`,
		authSession: {
			user: { id: userId },
			session: { activeOrganizationId: 'organization-a' }
		}
	} as unknown as FastifyRequest;
}

function createGuard(roles: Record<string, UserRole>): OrgPermissionGuard {
	const meService = {
		resolveOrganizationRole: vi.fn(async ({ userId }: { userId: string }) => roles[userId]!)
	} as unknown as MeService;
	return new OrgPermissionGuard(new Reflector(), meService);
}

describe('transaction and settings organization permission metadata', () => {
	it('sets the required guard order on both controllers', () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, TransactionsController)).toEqual([
			AuthOrApiKeyGuard,
			ActiveOrgGuard,
			OrgPermissionGuard
		]);
		expect(Reflect.getMetadata(GUARDS_METADATA, SettingsController)).toEqual([
			SessionGuard,
			ActiveOrgGuard,
			OrgPermissionGuard
		]);
	});

	it('sets complete transaction permission metadata', () => {
		for (const [method, permission] of transactionPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, TransactionsController.prototype[method])
			).toEqual(permission);
		}
	});

	it('sets complete settings permission metadata', () => {
		for (const [method, permission] of settingsPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, SettingsController.prototype[method])
			).toEqual(permission);
		}
	});
});

describe('transaction and settings organization permissions', () => {
	const guard = createGuard({
		readonly: 'readonly',
		finance: 'finance',
		agent: 'agent',
		manager: 'manager',
		owner: 'owner',
		admin: 'admin'
	});

	it('allows readonly transaction reads and rejects mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), TransactionsController.prototype.list, TransactionsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), TransactionsController.prototype.create, TransactionsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows finance transaction creates and updates', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), TransactionsController.prototype.create, TransactionsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), TransactionsController.prototype.update, TransactionsController)
			)
		).resolves.toBe(true);
	});

	it('allows agent transaction reads and rejects mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), TransactionsController.prototype.list, TransactionsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), TransactionsController.prototype.update, TransactionsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows manager transaction updates', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), TransactionsController.prototype.update, TransactionsController)
			)
		).resolves.toBe(true);
	});

	it('allows readonly and manager settings reads but rejects settings mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					SettingsController.prototype.listFinanceCategories,
					SettingsController
				)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('manager'),
					SettingsController.prototype.listFinanceCategories,
					SettingsController
				)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					SettingsController.prototype.createFinanceCategory,
					SettingsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('manager'),
					SettingsController.prototype.createFinanceCategory,
					SettingsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows owner and admin settings mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('owner'),
					SettingsController.prototype.createFinanceCategory,
					SettingsController
				)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('admin'),
					SettingsController.prototype.createFinanceCategory,
					SettingsController
				)
			)
		).resolves.toBe(true);
	});
});
