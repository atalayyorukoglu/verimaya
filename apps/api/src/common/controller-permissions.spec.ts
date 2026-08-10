/**
 * AUDIT-F09-11: organization permission coverage via reflection (not a hand-maintained
 * handler→permission table). Walks every controller route with Nest METHOD_METADATA,
 * reads @RequireOrgPermission metadata, and asserts:
 *   1) every org-auth-triad route declares a permission
 *   2) resource/action exists in organizationPermissionStatements
 *   3) GET → read; mutating verbs → write-class (create|update|delete), with a small
 *      intentional-exception table for claims a naive heuristic cannot express
 *
 * Role-matrix canActivate tests below are kept — they exercise OrgPermissionGuard +
 * permissions.ts runtime behaviour, which reflection alone cannot replace.
 */
import 'reflect-metadata';
import { ForbiddenException, RequestMethod, type ExecutionContext } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { AdMetricsController } from '../ad-metrics/ad-metrics.controller';
import { ApiKeysController } from '../api-keys/api-keys.controller';
import { AppointmentsController } from '../appointments/appointments.controller';
import { AuditLogsController } from '../audit-logs/audit-logs.controller';
import { MeService } from '../auth/me.service';
import { ContactsController } from '../contacts/contacts.controller';
import { AdsController } from '../integrations/ads/ads.controller';
import { GhlController } from '../integrations/ghl/ghl.controller';
import { MembersController } from '../members/members.controller';
import { ReportsController } from '../reports/reports.controller';
import { ScorecardController } from '../scorecard/scorecard.controller';
import { SettingsController } from '../settings/settings.controller';
import { TenantsController } from '../tenants/tenants.controller';
import { TransactionsController } from '../transactions/transactions.controller';
import { WebhookSubscriptionsController } from '../webhook-subscriptions/webhook-subscriptions.controller';
import { WhatsappController } from '../whatsapp/whatsapp.controller';
import {
	organizationPermissionStatements,
	type OrgPermissionAction,
	type OrgPermissionResource
} from '../auth/permissions';
import {
	discoverAllControllers,
	effectiveGuards,
	hasOrgAuthTriad
} from './all-controllers';
import { OrgPermissionGuard } from './org-permission.guard';
import {
	ORG_PERMISSION_METADATA_KEY,
	type OrgPermissionRequirement
} from './require-org-permission.decorator';

/**
 * Org-protected controllers are *derived*, not listed: every discovered controller with
 * at least one route behind the guard triad. Public surfaces (health, karne, webhooks,
 * OAuth callbacks, /me) fall out automatically and are covered by guard-coverage.spec.ts.
 */
const ORG_PROTECTED_CONTROLLERS = (await discoverAllControllers()).filter((controller) =>
	Object.getOwnPropertyNames(controller.prototype as object).some((name) => {
		if (name === 'constructor') return false;
		const handler = (controller.prototype as Record<string, unknown>)[name];
		if (typeof handler !== 'function') return false;
		if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined) return false;
		return hasOrgAuthTriad(effectiveGuards(controller, handler));
	})
);

const WRITE_ACTIONS = new Set(['create', 'update', 'delete']);

type RoutePermission = {
	controller: string;
	handler: string;
	key: string;
	httpMethod: RequestMethod;
	httpMethodName: string;
	path: string;
	permission: OrgPermissionRequirement | undefined;
};

/**
 * Intentional permission choices that a GET→read / mutating→write-class heuristic
 * cannot express (or would mispredict). Reflection still requires the decorator;
 * this table locks the business choice so a silent change fails the spec.
 *
 * Why these cannot be derived from HTTP alone:
 * - authorize is GET but starts OAuth (settings:update)
 * - merge is POST but destroys a record (patient:delete)
 * - financeSummary is on ContactsController but reads finance
 * - approveDrafts is the money path (finance:create), not patient:update
 * - settings resource has no create/delete actions — create/remove endpoints use update
 */
const INTENTIONAL_PERMISSION_LOCKS: Array<{
	key: string;
	permission: OrgPermissionRequirement;
	reason: string;
}> = [
	{
		key: 'AdsController.authorize',
		permission: { resource: 'settings', action: 'update' },
		reason: 'GET starts OAuth connect flow — write-class despite verb'
	},
	{
		key: 'GhlController.authorize',
		permission: { resource: 'settings', action: 'update' },
		reason: 'GET starts OAuth connect flow — write-class despite verb'
	},
	{
		key: 'ContactsController.merge',
		permission: { resource: 'contact', action: 'delete' },
		reason: 'POST merge destroys the loser patient record'
	},
	{
		key: 'ContactsController.merge',
		permission: { resource: 'contact', action: 'delete' },
		reason: 'POST merge destroys the loser contact record'
	},
	{
		key: 'ContactsController.financeSummary',
		permission: { resource: 'finance', action: 'read' },
		reason: 'Cross-resource: patient route exposes finance aggregates'
	},
	{
		key: 'ContactsController.autoLinkTransactions',
		permission: { resource: 'finance', action: 'update' },
		reason: 'Cross-resource: patient route mutates transactions (contact_id link)'
	},
	{
		key: 'WhatsappController.approveDrafts',
		permission: { resource: 'finance', action: 'create' },
		reason: 'Money path — writes transactions, not patient inbox state'
	},
	{
		key: 'WhatsappController.createCategory',
		permission: { resource: 'finance', action: 'create' },
		reason:
			'GAP-F09-16 inline category on AI import path — finance ops, not settings-admin (settings dictionary uses settings:update; same rationale as approveDrafts)'
	},
	{
		key: 'AdMetricsController.sync',
		permission: { resource: 'finance', action: 'update' },
		reason: 'POST sync mutates ad_metrics_daily under finance'
	}
];

function isKnownPermission(permission: OrgPermissionRequirement): boolean {
	const actions = organizationPermissionStatements[permission.resource] as readonly string[] | undefined;
	if (!actions) return false;
	return actions.includes(permission.action);
}

function findProtectedRoutes(controllers: Function[]): RoutePermission[] {
	const out: RoutePermission[] = [];
	for (const controller of controllers) {
		const proto = controller.prototype as Record<string, unknown>;
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name === 'constructor') continue;
			const handler = proto[name];
			if (typeof handler !== 'function') continue;

			const httpMethod: RequestMethod | undefined = Reflect.getMetadata(METHOD_METADATA, handler);
			if (httpMethod === undefined) continue;

			const permission = Reflect.getMetadata(
				ORG_PERMISSION_METADATA_KEY,
				handler
			) as OrgPermissionRequirement | undefined;

			out.push({
				controller: controller.name,
				handler: name,
				key: `${controller.name}.${name}`,
				httpMethod,
				httpMethodName: RequestMethod[httpMethod] ?? String(httpMethod),
				path: (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '',
				permission
			});
		}
	}
	return out;
}

function matchesVerbClass(route: RoutePermission): boolean {
	if (!route.permission) return false;
	const lock = INTENTIONAL_PERMISSION_LOCKS.find((l) => l.key === route.key);
	if (lock) {
		return (
			lock.permission.resource === route.permission.resource &&
			lock.permission.action === route.permission.action
		);
	}
	if (route.httpMethod === RequestMethod.GET) {
		return route.permission.action === 'read';
	}
	return WRITE_ACTIONS.has(route.permission.action);
}

describe('AUDIT-F09-11: org permission metadata via reflection', () => {
	const routes = findProtectedRoutes(ORG_PROTECTED_CONTROLLERS);

	it('the reflection walk actually finds handlers (guards against vacuous pass)', () => {
		expect(routes.length).toBeGreaterThan(70);
	});

	it('every org-protected route declares @RequireOrgPermission', () => {
		const missing = routes
			.filter((r) => !r.permission)
			.map((r) => `${r.key} (${r.httpMethodName} ${r.path})`);
		expect(missing).toEqual([]);
	});

	it('every declared permission exists in organizationPermissionStatements', () => {
		const unknown = routes
			.filter((r) => r.permission && !isKnownPermission(r.permission))
			.map(
				(r) =>
					`${r.key} → ${r.permission!.resource}:${r.permission!.action as string}`
			);
		expect(unknown).toEqual([]);
	});

	it('GET → read and mutating verbs → write-class, unless intentionally locked', () => {
		const mismatches = routes
			.filter((r) => r.permission && !matchesVerbClass(r))
			.map(
				(r) =>
					`${r.key} (${r.httpMethodName}) has ${r.permission!.resource}:${r.permission!.action}`
			);
		expect(mismatches).toEqual([]);
	});

	it('intentional permission locks still match decorator metadata', () => {
		const byKey = new Map(routes.map((r) => [r.key, r]));
		for (const lock of INTENTIONAL_PERMISSION_LOCKS) {
			const route = byKey.get(lock.key);
			expect(route, `lock references missing handler: ${lock.key} (${lock.reason})`).toBeDefined();
			expect(route!.permission).toEqual(lock.permission);
		}
	});

	it('settings write endpoints use update (resource has no create/delete actions)', () => {
		const settingsWrites = routes.filter(
			(r) =>
				r.permission?.resource === 'settings' &&
				r.httpMethod !== RequestMethod.GET
		);
		expect(settingsWrites.length).toBeGreaterThan(0);
		for (const route of settingsWrites) {
			expect(
				route.permission!.action,
				`${route.key} — settings model only allows read|update`
			).toBe('update' satisfies OrgPermissionAction<'settings'>);
		}
	});

	it('type-level OrgPermissionResource keys match the runtime statements export', () => {
		const resources = Object.keys(organizationPermissionStatements).sort();
		expect(resources).toEqual(
			(['finance', 'contact', 'settings'] as OrgPermissionResource[]).slice().sort()
		);
	});
});

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
				makeContext(sessionRequest('readonly'), ContactsController.prototype.list, ContactsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), ContactsController.prototype.create, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), ContactsController.prototype.update, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), ContactsController.prototype.remove, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
	});

	it('rejects agent delete and merge', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), ContactsController.prototype.remove, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), ContactsController.prototype.merge, ContactsController)
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
				makeContext(sessionRequest('finance'), ContactsController.prototype.create, ContactsController)
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('finance'), ContactsController.prototype.update, ContactsController)
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
				makeContext(sessionRequest('agent'), ContactsController.prototype.create, ContactsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), ContactsController.prototype.update, ContactsController)
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
				makeContext(sessionRequest('manager'), ContactsController.prototype.remove, ContactsController)
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), ContactsController.prototype.merge, ContactsController)
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
				makeContext(req, ContactsController.prototype.update, ContactsController)
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
