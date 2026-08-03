import {
	BadRequestException,
	Controller,
	Get,
	HttpCode,
	Post,
	Query,
	Req,
	UseGuards
} from '@nestjs/common';
import { adMetricsListParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { AdMetricsService } from './ad-metrics.service';
import { AdMetricsSyncService } from './ad-metrics.sync.service';

@Controller('ad-metrics')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class AdMetricsController {
	constructor(
		private readonly adMetricsService: AdMetricsService,
		private readonly adMetricsSyncService: AdMetricsSyncService
	) {}

	@Get()
	@RequireOrgPermission('finance', 'read')
	list(
		@Req() req: FastifyRequest,
		@Query('from') from?: string,
		@Query('to') to?: string,
		@Query('provider') provider?: string
	) {
		const params = adMetricsListParams.parse({ from, to, provider });
		return this.adMetricsService.list(getActiveOrgId(req), params);
	}

	/** One-shot pull (no scheduler). Runs sync inline and returns upsert counts. */
	@Post('sync')
	@HttpCode(200)
	@RequireOrgPermission('finance', 'update')
	async sync(@Req() req: FastifyRequest) {
		try {
			return await this.adMetricsSyncService.sync(getActiveOrgId(req));
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Ad metrics sync failed';
			throw new BadRequestException(message);
		}
	}
}
