import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { auditLogListQuerySchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { parseQuery } from '../common/mappers';
import { AuditLogsService } from './audit-logs.service';

@Controller('audit-logs')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class AuditLogsController {
	constructor(private readonly auditLogsService: AuditLogsService) {}

	@Get()
	@RequireOrgPermission('settings', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(auditLogListQuerySchema, query, req);
		return this.auditLogsService.list(getActiveOrgId(req), params);
	}
}
