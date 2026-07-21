import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class AuditLogsController {
	constructor(private readonly auditLogsService: AuditLogsService) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.auditLogsService.list(getActiveOrgId(req), params);
	}
}
