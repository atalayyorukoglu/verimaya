import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { reportPeriodParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class ReportsController {
	constructor(private readonly reportsService: ReportsService) {}

	@Get('summary')
	summary(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.summary(getActiveOrgId(req), params);
	}

	@Get('by-category')
	byCategory(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.byCategory(getActiveOrgId(req), params);
	}
}
