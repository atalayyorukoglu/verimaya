import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { dataDeleteExecuteBodySchema, dataDeletePreviewBodySchema } from '@verimaya/shared';
import { MeService } from '../auth/me.service';
import { SessionGuard } from '../auth/session.guard';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest
} from '../common/active-org.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { DataDeleteService } from './data-delete.service';

/**
 * G-25 — operational data delete. Session-only (no API key): owner hard-gate
 * sits in the service and is not grantable via G-11 overrides.
 */
@Controller('settings/data-delete')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class DataDeleteController {
	constructor(
		private readonly dataDelete: DataDeleteService,
		private readonly meService: MeService
	) {}

	@Post('preview')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Preview counts rows and mints a signed plan_token — no durable mutation; repeat is safe.'
	)
	async preview(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(dataDeletePreviewBodySchema, body, req);
		const tenantId = getActiveOrgId(req);
		const role = await this.resolveRole(req, tenantId);
		return this.dataDelete.preview(tenantId, role, input);
	}

	@Post('execute')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Destructive wipe is gated by single-use plan_token (jti) + org-name confirm; client Idempotency-Key would mask a second confirm attempt.'
	)
	async execute(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(dataDeleteExecuteBodySchema, body, req);
		const tenantId = getActiveOrgId(req);
		const role = await this.resolveRole(req, tenantId);
		return this.dataDelete.execute(tenantId, role, input, getActorFromRequest(req));
	}

	private async resolveRole(req: FastifyRequest, tenantId: string) {
		const session = req.authSession;
		if (!session) {
			// SessionGuard already required a session; belt-and-braces for typing.
			throw new Error('auth_session_missing');
		}
		return this.meService.resolveOrganizationRole({
			userId: session.user.id,
			activeOrganizationId: tenantId,
			requestId: String(req.id)
		});
	}
}
