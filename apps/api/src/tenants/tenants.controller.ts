import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { tenantUpdateSchema } from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest } from '../common/active-org.guard';
import { parseBody } from '../common/mappers';
import { TenantsService } from './tenants.service';

@Controller('tenants')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class TenantsController {
	constructor(private readonly tenantsService: TenantsService) {}

	@Get('current')
	getCurrent(@Req() req: FastifyRequest) {
		return this.tenantsService.get(getActiveOrgId(req));
	}

	@Patch('current')
	updateCurrent(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(tenantUpdateSchema, body, req);
		const actor = getActorFromRequest(req);
		return this.tenantsService.update(getActiveOrgId(req), input, actor);
	}
}
