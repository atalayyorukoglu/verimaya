import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@verimaya/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MeService } from '../../auth/me.service';
import { OrgPermissionGuard } from '../../common/org-permission.guard';
import { ORG_PERMISSION_METADATA_KEY } from '../../common/require-org-permission.decorator';
import { GHL_RECONCILE_JOB_TYPE } from '../../queue/queue.constants';
import type { QueueService } from '../../queue/queue.service';
import type { SettingsService } from '../../settings/settings.service';
import { GhlController } from './ghl.controller';
import type { GhlOAuthStateService } from './ghl-oauth.state';
import type { GhlReconcileResult, GhlReconcileService } from './ghl.reconcile.service';

function mockReply(): FastifyReply {
	const reply = {
		statusCode: 200,
		status(code: number) {
			reply.statusCode = code;
			return reply;
		}
	};
	return reply as unknown as FastifyReply;
}

function mockReq(tenantId: string): FastifyRequest {
	return {
		id: 'req-test',
		authSession: {
			user: { id: 'user-1' },
			session: { activeOrganizationId: tenantId }
		}
	} as unknown as FastifyRequest;
}

function emptyReconcileResult(): GhlReconcileResult {
	return {
		mode: 'skipped_no_oauth',
		lookbackDays: 7,
		scanned: 0,
		created: 0,
		updated: 0,
		unchanged: 0,
		skipped: 0,
		diffCount: 0,
		diffs: []
	};
}

describe('GhlController.reconcile trigger isolation', () => {
	const tenantA = randomUUID();
	const tenantB = randomUUID();

	let enqueuedTenantIds: string[];
	let reconcileCalls: string[];
	let inFlightJobs: Array<{ id: string; name: string; data: { tenantId: string } }>;
	let queueReady: boolean;
	let enqueueFails: boolean;
	let controller: GhlController;

	beforeEach(() => {
		enqueuedTenantIds = [];
		reconcileCalls = [];
		inFlightJobs = [];
		queueReady = true;
		enqueueFails = false;

		const queue = {
			getDefaultQueue: () =>
				queueReady
					? {
							getJobs: async () => inFlightJobs
						}
					: null,
			enqueueGhlReconcile: async (tenantId: string) => {
				if (enqueueFails) {
					throw new Error('Redis unavailable');
				}
				enqueuedTenantIds.push(tenantId);
				return { id: `job-${tenantId}` };
			}
		} as unknown as QueueService;

		const ghlReconcile = {
			reconcile: async (tenantId: string) => {
				reconcileCalls.push(tenantId);
				return emptyReconcileResult();
			}
		} as unknown as GhlReconcileService;

		controller = new GhlController(
			{} as GhlOAuthStateService,
			{} as SettingsService,
			queue,
			ghlReconcile
		);
	});

	it('tenant A trigger enqueues only tenant A — never tenant B', async () => {
		const reply = mockReply();
		const body = await controller.reconcile(mockReq(tenantA), reply);

		expect(body).toEqual({
			status: 'queued',
			job_id: `job-${tenantA}`,
			already_queued: false
		});
		expect(reply.statusCode).toBe(202);
		expect(enqueuedTenantIds).toEqual([tenantA]);
		expect(enqueuedTenantIds).not.toContain(tenantB);
		expect(reconcileCalls).toEqual([]);
	});

	it('does not enqueue a second job when tenant A already has an in-flight reconcile', async () => {
		inFlightJobs = [
			{
				id: 'existing-a',
				name: GHL_RECONCILE_JOB_TYPE,
				data: { tenantId: tenantA }
			},
			{
				id: 'existing-b',
				name: GHL_RECONCILE_JOB_TYPE,
				data: { tenantId: tenantB }
			}
		];

		const reply = mockReply();
		const body = await controller.reconcile(mockReq(tenantA), reply);

		expect(body).toEqual({
			status: 'queued',
			job_id: 'existing-a',
			already_queued: true
		});
		expect(enqueuedTenantIds).toEqual([]);
		expect(reconcileCalls).toEqual([]);
	});

	it('tenant B in-flight job does not block tenant A enqueue', async () => {
		inFlightJobs = [
			{
				id: 'existing-b',
				name: GHL_RECONCILE_JOB_TYPE,
				data: { tenantId: tenantB }
			}
		];

		const reply = mockReply();
		await controller.reconcile(mockReq(tenantA), reply);

		expect(enqueuedTenantIds).toEqual([tenantA]);
	});

	it('falls back to inline reconcile for the active tenant when queue is down', async () => {
		queueReady = false;
		const reply = mockReply();
		const body = await controller.reconcile(mockReq(tenantA), reply);

		expect(body.status).toBe('completed');
		expect(reply.statusCode).toBe(200);
		expect(enqueuedTenantIds).toEqual([]);
		expect(reconcileCalls).toEqual([tenantA]);
		expect(reconcileCalls).not.toContain(tenantB);
	});

	it('falls back to inline reconcile when enqueue throws (Redis error)', async () => {
		enqueueFails = true;
		const reply = mockReply();
		const body = await controller.reconcile(mockReq(tenantA), reply);

		expect(body.status).toBe('completed');
		expect(reconcileCalls).toEqual([tenantA]);
	});
});

describe('GhlController.reconcile permission (settings.update)', () => {
	function makeContext(
		req: FastifyRequest,
		handler: () => unknown
	): {
		switchToHttp: () => { getRequest: () => FastifyRequest; getResponse: () => object };
		getHandler: () => () => unknown;
		getClass: () => typeof GhlController;
	} {
		return {
			switchToHttp: () => ({
				getRequest: () => req,
				getResponse: () => ({})
			}),
			getHandler: () => handler,
			getClass: () => GhlController
		};
	}

	function sessionRequest(role: UserRole): FastifyRequest {
		return {
			id: `request-${role}`,
			authSession: {
				user: { id: role },
				session: { activeOrganizationId: 'organization-a' }
			}
		} as unknown as FastifyRequest;
	}

	const guard = new OrgPermissionGuard(
		new Reflector(),
		{
			resolveOrganizationRole: vi.fn(async ({ userId }: { userId: string }) => userId as UserRole)
		} as unknown as MeService
	);

	it('exposes settings:update on reconcile (same as authorize/disconnect)', () => {
		const requirement = Reflect.getMetadata(
			ORG_PERMISSION_METADATA_KEY,
			GhlController.prototype.reconcile
		);
		expect(requirement).toEqual({ resource: 'settings', action: 'update' });
	});

	it('rejects agent/manager/readonly; allows owner/admin', async () => {
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('agent'), GhlController.prototype.reconcile) as never
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('manager'), GhlController.prototype.reconcile) as never
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('readonly'), GhlController.prototype.reconcile) as never
			)
		).rejects.toBeInstanceOf(ForbiddenException);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('owner'), GhlController.prototype.reconcile) as never
			)
		).resolves.toBe(true);
		await expect(
			guard.canActivate(
				makeContext(sessionRequest('admin'), GhlController.prototype.reconcile) as never
			)
		).resolves.toBe(true);
	});
});
