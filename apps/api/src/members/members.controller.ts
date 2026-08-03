import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class MembersController {
	constructor(private readonly membersService: MembersService) {}

	@Get()
	@RequireOrgPermission('settings', 'read')
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.membersService.list(getActiveOrgId(req), params);
	}
}
