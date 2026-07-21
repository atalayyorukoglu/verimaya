import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { adMetricsListParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AdMetricsService } from './ad-metrics.service';

@Controller('ad-metrics')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class AdMetricsController {
	constructor(private readonly adMetricsService: AdMetricsService) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('provider') provider?: string
	) {
		const params = adMetricsListParams.parse({ from, to, provider });
		return this.adMetricsService.list(getActiveOrgId(req), params);
	}
}
