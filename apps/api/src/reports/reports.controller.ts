import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { reportByCategoryDetailParams, reportPeriodParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard)
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

	@Get('by-category-detail')
	byCategoryDetail(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('category') category?: string
	) {
		const params = reportByCategoryDetailParams.parse({ from, to, category });
		return this.reportsService.byCategoryDetail(getActiveOrgId(req), params);
	}

	@Get('monthly')
	monthly(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.monthly(getActiveOrgId(req), params);
	}
}
