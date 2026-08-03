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
import { AuditLogsController } from '../audit-logs/audit-logs.controller';
import { MembersController } from '../members/members.controller';
import { ReportsController } from '../reports/reports.controller';
import { AdMetricsController } from '../ad-metrics/ad-metrics.controller';
import { TenantsController } from '../tenants/tenants.controller';
import { WebhookSubscriptionsController } from '../webhook-subscriptions/webhook-subscriptions.controller';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { WhatsappController } from '../whatsapp/whatsapp.controller';
import { AdsController } from '../integrations/ads/ads.controller';
import { GhlController } from '../integrations/ghl/ghl.controller';
import { ScorecardController } from '../scorecard/scorecard.controller';
import { HealthController } from '../health/health.controller';
import { KarneController } from '../karne/karne.controller';
import { WebhooksController } from '../webhooks/webhooks.controller';
import { MeController } from '../auth/me.controller';
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

const auditLogsPermissions: Array<[keyof AuditLogsController, OrgPermissionRequirement]> = [
	['list', { resource: 'settings', action: 'read' }]
];

const membersPermissions: Array<[keyof MembersController, OrgPermissionRequirement]> = [
	['list', { resource: 'settings', action: 'read' }]
];

const reportsPermissions: Array<[keyof ReportsController, OrgPermissionRequirement]> = [
	['summary', { resource: 'finance', action: 'read' }],
	['byCategory', { resource: 'finance', action: 'read' }],
	['byCategoryDetail', { resource: 'finance', action: 'read' }],
	['monthly', { resource: 'finance', action: 'read' }],
	['marketing', { resource: 'finance', action: 'read' }]
];

const adMetricsPermissions: Array<[keyof AdMetricsController, OrgPermissionRequirement]> = [
	['list', { resource: 'finance', action: 'read' }],
	['sync', { resource: 'finance', action: 'update' }]
];

const tenantsPermissions: Array<[keyof TenantsController, OrgPermissionRequirement]> = [
	['getCurrent', { resource: 'settings', action: 'read' }],
	['updateCurrent', { resource: 'settings', action: 'update' }]
];

const webhookSubscriptionsPermissions: Array<
	[keyof WebhookSubscriptionsController, OrgPermissionRequirement]
> = [
	['list', { resource: 'settings', action: 'read' }],
	['create', { resource: 'settings', action: 'update' }],
	['remove', { resource: 'settings', action: 'update' }]
];

const apiKeysPermissions: Array<[keyof ApiKeysController, OrgPermissionRequirement]> = [
	['list', { resource: 'settings', action: 'read' }],
	['create', { resource: 'settings', action: 'update' }],
	['revoke', { resource: 'settings', action: 'update' }]
];

const whatsappPermissions: Array<[keyof WhatsappController, OrgPermissionRequirement]> = [
	['parse', { resource: 'patient', action: 'create' }],
	['listInbox', { resource: 'patient', action: 'read' }],
	['getInboxItem', { resource: 'patient', action: 'read' }],
	['processInbox', { resource: 'patient', action: 'update' }],
	['parseInboxItem', { resource: 'patient', action: 'update' }],
	['approveInboxItem', { resource: 'patient', action: 'update' }],
	['ignoreInboxItem', { resource: 'patient', action: 'update' }],
	['createCorrection', { resource: 'patient', action: 'create' }],
	['listCorrections', { resource: 'patient', action: 'read' }]
];

const adsPermissions: Array<[keyof AdsController, OrgPermissionRequirement]> = [
	['status', { resource: 'settings', action: 'read' }],
	['updateGoogleCustomerId', { resource: 'settings', action: 'update' }],
	['authorize', { resource: 'settings', action: 'update' }],
	['disconnect', { resource: 'settings', action: 'update' }]
];

const ghlPermissions: Array<[keyof GhlController, OrgPermissionRequirement]> = [
	['status', { resource: 'settings', action: 'read' }],
	['authorize', { resource: 'settings', action: 'update' }],
	['disconnect', { resource: 'settings', action: 'update' }]
];

const scorecardPermissions: Array<[keyof ScorecardController, OrgPermissionRequirement]> = [
	['getCurrent', { resource: 'settings', action: 'read' }],
	['listAssessments', { resource: 'settings', action: 'read' }],
	['getAssessment', { resource: 'settings', action: 'read' }],
	['compare', { resource: 'settings', action: 'read' }],
	['getProfile', { resource: 'settings', action: 'read' }],
	['createProfile', { resource: 'settings', action: 'update' }],
	['patchProfile', { resource: 'settings', action: 'update' }],
	['startAssessment', { resource: 'settings', action: 'update' }],
	['completeAssessment', { resource: 'settings', action: 'update' }],
	['upsertAnswer', { resource: 'settings', action: 'update' }],
	['startBaseline', { resource: 'settings', action: 'update' }],
	['autoFillOpen', { resource: 'settings', action: 'update' }],
	['autoFillAssessment', { resource: 'settings', action: 'update' }]
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

describe('remaining authenticated controller organization permission metadata', () => {
	it('sets the required guard order on class-level guarded controllers', () => {
		for (const controller of [
			AuditLogsController,
			MembersController,
			TenantsController,
			WebhookSubscriptionsController,
			ApiKeysController,
			ScorecardController
		]) {
			expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
				SessionGuard,
				ActiveOrgGuard,
				OrgPermissionGuard
			]);
		}
		for (const controller of [ReportsController, AdMetricsController, WhatsappController]) {
			expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
				controller === AdMetricsController
					? [SessionGuard, ActiveOrgGuard, OrgPermissionGuard]
					: [AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard]
			);
		}
	});

	it('sets the required method-level guard order on OAuth integration controllers', () => {
		for (const [method, requirement] of adsPermissions) {
			expect(Reflect.getMetadata(GUARDS_METADATA, AdsController.prototype[method])).toEqual([
				AuthOrApiKeyGuard,
				ActiveOrgGuard,
				OrgPermissionGuard
			]);
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, AdsController.prototype[method])
			).toEqual(requirement);
		}
		for (const [method, requirement] of ghlPermissions) {
			expect(Reflect.getMetadata(GUARDS_METADATA, GhlController.prototype[method])).toEqual([
				AuthOrApiKeyGuard,
				ActiveOrgGuard,
				OrgPermissionGuard
			]);
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, GhlController.prototype[method])
			).toEqual(requirement);
		}
	});

	it('leaves public/health/webhook/callback-adjacent controllers without an org guard', () => {
		// Health checks, the public Karne funnel, and signature-verified webhooks
		// are load-bearing public surfaces (AUTH-01C7) — they must never gain
		// AuthOrApiKeyGuard/ActiveOrgGuard/OrgPermissionGuard by accident.
		expect(Reflect.getMetadata(GUARDS_METADATA, HealthController)).toBeUndefined();
		expect(Reflect.getMetadata(GUARDS_METADATA, HealthController.prototype.check)).toBeUndefined();
		expect(Reflect.getMetadata(GUARDS_METADATA, HealthController.prototype.ready)).toBeUndefined();

		expect(Reflect.getMetadata(GUARDS_METADATA, KarneController)).toBeUndefined();

		expect(Reflect.getMetadata(GUARDS_METADATA, WebhooksController)).toBeUndefined();

		// /me is session-only (own profile, not a tenant-scoped org resource) —
		// intentionally has no OrgPermissionGuard/RequireOrgPermission.
		expect(Reflect.getMetadata(GUARDS_METADATA, MeController)).toBeUndefined();
		expect(Reflect.getMetadata(GUARDS_METADATA, MeController.prototype.me)).toEqual([SessionGuard]);
		expect(
			Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, MeController.prototype.me)
		).toBeUndefined();
	});

	it('leaves the OAuth callback endpoints unguarded', () => {
		expect(Reflect.getMetadata(GUARDS_METADATA, AdsController.prototype.callback)).toBeUndefined();
		expect(
			Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, AdsController.prototype.callback)
		).toBeUndefined();
		expect(Reflect.getMetadata(GUARDS_METADATA, GhlController.prototype.callback)).toBeUndefined();
		expect(
			Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, GhlController.prototype.callback)
		).toBeUndefined();
	});

	it('sets complete permission metadata for audit-logs, members, reports, ad-metrics', () => {
		for (const [method, permission] of auditLogsPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, AuditLogsController.prototype[method])
			).toEqual(permission);
		}
		for (const [method, permission] of membersPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, MembersController.prototype[method])
			).toEqual(permission);
		}
		for (const [method, permission] of reportsPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, ReportsController.prototype[method])
			).toEqual(permission);
		}
		for (const [method, permission] of adMetricsPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, AdMetricsController.prototype[method])
			).toEqual(permission);
		}
	});

	it('sets complete permission metadata for tenants, webhook-subscriptions, api-keys, whatsapp', () => {
		for (const [method, permission] of tenantsPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, TenantsController.prototype[method])
			).toEqual(permission);
		}
		for (const [method, permission] of webhookSubscriptionsPermissions) {
			expect(
				Reflect.getMetadata(
					ORG_PERMISSION_METADATA_KEY,
					WebhookSubscriptionsController.prototype[method]
				)
			).toEqual(permission);
		}
		for (const [method, permission] of apiKeysPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, ApiKeysController.prototype[method])
			).toEqual(permission);
		}
		for (const [method, permission] of whatsappPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, WhatsappController.prototype[method])
			).toEqual(permission);
		}
	});

	it('sets complete permission metadata for scorecard', () => {
		for (const [method, permission] of scorecardPermissions) {
			expect(
				Reflect.getMetadata(ORG_PERMISSION_METADATA_KEY, ScorecardController.prototype[method])
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

describe('remaining authenticated controller organization permissions', () => {
	const guard = createGuard({
		readonly: 'readonly',
		finance: 'finance',
		agent: 'agent',
		manager: 'manager',
		owner: 'owner',
		admin: 'admin'
	});

	it('allows readonly reads on settings-mapped controllers and rejects mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), AuditLogsController.prototype.list, AuditLogsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), MembersController.prototype.list, MembersController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), TenantsController.prototype.getCurrent, TenantsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					TenantsController.prototype.updateCurrent,
					TenantsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					WebhookSubscriptionsController.prototype.create,
					WebhookSubscriptionsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					ApiKeysController.prototype.create,
					ApiKeysController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects agent from settings mutations (api-keys, webhook-subscriptions, tenants)', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), ApiKeysController.prototype.create, ApiKeysController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('agent'),
					WebhookSubscriptionsController.prototype.remove,
					WebhookSubscriptionsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), TenantsController.prototype.updateCurrent, TenantsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects manager (settings.read only) and allows owner/admin on settings mutations', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), ApiKeysController.prototype.create, ApiKeysController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('owner'), ApiKeysController.prototype.create, ApiKeysController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('manager'),
					WebhookSubscriptionsController.prototype.remove,
					WebhookSubscriptionsController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('admin'),
					WebhookSubscriptionsController.prototype.remove,
					WebhookSubscriptionsController
				)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), TenantsController.prototype.updateCurrent, TenantsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('owner'), TenantsController.prototype.updateCurrent, TenantsController)
			)
		).resolves.toBe(true);
	});

	it('allows readonly finance reads and rejects finance mutation on reports/ad-metrics', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), ReportsController.prototype.summary, ReportsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), AdMetricsController.prototype.sync, AdMetricsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), AdMetricsController.prototype.sync, AdMetricsController)
			)
		).resolves.toBe(true);
	});

	it('rejects finance role from patient-mapped whatsapp mutations, allows agent', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), WhatsappController.prototype.parse, WhatsappController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), WhatsappController.prototype.parse, WhatsappController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('finance'),
					WhatsappController.prototype.processInbox,
					WhatsappController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('allows readonly status reads and restricts OAuth authorize/disconnect to owner/admin (settings.update)', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), AdsController.prototype.status, AdsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), AdsController.prototype.authorize, AdsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), AdsController.prototype.authorize, AdsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), AdsController.prototype.authorize, AdsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('admin'), AdsController.prototype.authorize, AdsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), GhlController.prototype.disconnect, GhlController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('owner'), GhlController.prototype.disconnect, GhlController)
			)
		).resolves.toBe(true);
	});

	it('allows any authenticated role to read the scorecard, restricts mutations to owner/admin', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), ScorecardController.prototype.getCurrent, ScorecardController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('readonly'),
					ScorecardController.prototype.startAssessment,
					ScorecardController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('manager'),
					ScorecardController.prototype.startAssessment,
					ScorecardController
				)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(
					sessionRequest('owner'),
					ScorecardController.prototype.startAssessment,
					ScorecardController
				)
			)
		).resolves.toBe(true);
	});
});
