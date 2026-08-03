import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { tenantUpdateSchema } from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest } from '../common/active-org.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class TenantsController {
	constructor(private readonly tenantsService: TenantsService) {}

	@Get('current')
	@RequireOrgPermission('settings', 'read')
	getCurrent(@Req() req: FastifyRequest) {
		return this.tenantsService.get(getActiveOrgId(req));
	}

	@Patch('current')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Sets absolute tenant fields (name/base_currency/timezone/etc.) to caller-supplied values, each falling back to the existing value when omitted — repeat calls converge to the same state. The audit-log write is append-only and a harmless duplicate on a genuine retry.'
	)
	updateCurrent(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(tenantUpdateSchema, body, req);
		const actor = getActorFromRequest(req);
		return this.tenantsService.update(getActiveOrgId(req), input, actor);
	}
}
