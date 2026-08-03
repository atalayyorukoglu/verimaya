import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { MeService } from '../auth/me.service';
import { SessionGuard } from '../auth/session.guard';
import { AppointmentsController } from '../appointments/appointments.controller';
import { ContactsController } from '../contacts/contacts.controller';
import { PatientsController } from '../patients/patients.controller';
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

const patientPermissions: Array<[keyof PatientsController, OrgPermissionRequirement]> = [
	['list', { resource: 'patient', action: 'read' }],
	['duplicateGroups', { resource: 'patient', action: 'read' }],
	['merge', { resource: 'patient', action: 'delete' }],
	['listFiles', { resource: 'patient', action: 'read' }],
	['downloadFile', { resource: 'patient', action: 'read' }],
	['financeSummary', { resource: 'finance', action: 'read' }],
	['presignFile', { resource: 'patient', action: 'update' }],
	['putFileContent', { resource: 'patient', action: 'update' }],
	['confirmFile', { resource: 'patient', action: 'update' }],
	['createFile', { resource: 'patient', action: 'update' }],
	['get', { resource: 'patient', action: 'read' }],
	['create', { resource: 'patient', action: 'create' }],
	['update', { resource: 'patient', action: 'update' }],
	['remove', { resource: 'patient', action: 'delete' }]
];

const contactPermissions: Array<[keyof ContactsController, OrgPermissionRequirement]> = [
	['list', { resource: 'patient', action: 'read' }],
	['duplicateGroups', { resource: 'patient', action: 'read' }],
	['merge', { resource: 'patient', action: 'delete' }],
	['get', { resource: 'patient', action: 'read' }],
	['create', { resource: 'patient', action: 'create' }],
	['update', { resource: 'patient', action: 'update' }]
];

const appointmentPermissions: Array<[keyof AppointmentsController, OrgPermissionRequirement]> = [
	['list', { resource: 'patient', action: 'read' }],
	['create', { resource: 'patient', action: 'create' }],
	['update', { resource: 'patient', action: 'update' }]
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

describe('patient-domain organization permission metadata', () => {
	it('sets the required guard order on patient-domain controllers', () => {
		for (const controller of [PatientsController, ContactsController, AppointmentsController]) {
			expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
				AuthOrApiKeyGuard,
				ActiveOrgGuard,
				OrgPermissionGuard
			]);
		}
	});

	it('sets complete patients permission metadata', () => {
		for (const [method, permission] of patientPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, PatientsController.prototype[method])
			).toEqual(permission);
		}
	});

	it('sets complete contacts permission metadata', () => {
		for (const [method, permission] of contactPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, ContactsController.prototype[method])
			).toEqual(permission);
		}
	});

	it('sets complete appointments permission metadata', () => {
		for (const [method, permission] of appointmentPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, AppointmentsController.prototype[method])
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

describe('patient-domain organization permissions', () => {
	const guard = createGuard({
		readonly: 'readonly',
		finance: 'finance',
		agent: 'agent',
		manager: 'manager',
		owner: 'owner',
		admin: 'admin'
	});

	it('allows readonly patient reads and rejects mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), PatientsController.prototype.list, PatientsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), PatientsController.prototype.create, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), PatientsController.prototype.update, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), PatientsController.prototype.remove, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects agent delete and merge', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), PatientsController.prototype.remove, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), PatientsController.prototype.merge, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), ContactsController.prototype.merge, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects finance patient mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), PatientsController.prototype.create, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), PatientsController.prototype.update, PatientsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), AppointmentsController.prototype.create, AppointmentsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows agent patient create and update', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), PatientsController.prototype.create, PatientsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), PatientsController.prototype.update, PatientsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), AppointmentsController.prototype.update, AppointmentsController)
			)
		).resolves.toBe(true);
	});

	it('allows manager delete and merge', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), PatientsController.prototype.remove, PatientsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), PatientsController.prototype.merge, PatientsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), ContactsController.prototype.merge, ContactsController)
			)
		).resolves.toBe(true);
	});

	it('allows API-key-authenticated requests without resolving an organization role', async () => {
		const req = {
			id: 'request-api-key',
			apiKeyAuth: {
				tenantId: 'organization-a',
				apiKeyId: 'api-key-id',
				scopes: ['read']
			}
		} as unknown as FastifyRequest;

		await expect(
			guard.canActivate(
				makeContext(req, PatientsController.prototype.update, PatientsController)
			)
		).resolves.toBe(true);
	});
});
