import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { fxRateQuerySchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard } from '../common/active-org.guard';
import { parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { FxService } from './fx.service';

@Controller('fx')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class FxController {
	constructor(private readonly fxService: FxService) {}

	@Get('rate')
	@RequireOrgPermission('finance', 'read')
	getRate(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(fxRateQuerySchema, query, req);
		return this.fxService.getRate(params, String(req.id));
	}
}
