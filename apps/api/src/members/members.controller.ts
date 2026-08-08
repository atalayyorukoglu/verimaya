import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams, memberUpdateSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest } from '../common/active-org.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { parseBody } from '../common/mappers';
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

	@Patch(':id')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Sets an absolute role on a membership row; repeat PATCH with the same role converges. Audit log is append-only.'
	)
	update(@Req() req: FastifyRequest, @Param('id') id: string, @Body() body: unknown) {
		const input = parseBody(memberUpdateSchema, body, req);
		const actor = getActorFromRequest(req);
		return this.membersService.updateRole(getActiveOrgId(req), id, input, actor);
	}
}
