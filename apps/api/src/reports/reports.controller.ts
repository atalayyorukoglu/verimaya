import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
	marketingReportParams,
	reportByCategoryDetailParams,
	reportPeriodParams
} from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ReportsController {
	constructor(private readonly reportsService: ReportsService) {}

	@Get('summary')
	@RequireOrgPermission('finance', 'read')
	summary(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.summary(getActiveOrgId(req), params);
	}

	@Get('by-category')
	@RequireOrgPermission('finance', 'read')
	byCategory(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.byCategory(getActiveOrgId(req), params);
	}

	@Get('by-category-detail')
	@RequireOrgPermission('finance', 'read')
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
	@RequireOrgPermission('finance', 'read')
	monthly(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.monthly(getActiveOrgId(req), params);
	}

	@Get('marketing')
	@RequireOrgPermission('finance', 'read')
	marketing(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('provider') provider?: string
	) {
		const params = marketingReportParams.parse({ from, to, provider });
		return this.reportsService.marketing(getActiveOrgId(req), params);
	}

	@Get('patient-distribution')
	@RequireOrgPermission('finance', 'read')
	patientDistribution(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string
	) {
		const params = reportPeriodParams.parse({ from, to });
		return this.reportsService.patientDistribution(getActiveOrgId(req), params);
	}

	@Get('balances')
	@RequireOrgPermission('finance', 'read')
	balances(@Req() req: FastifyRequest) {
		return this.reportsService.balances(getActiveOrgId(req));
	}
}
