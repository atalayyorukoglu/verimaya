import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams, memberRoleUpdateSchema } from '@verimaya/shared';
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

	// AUDIT-F09-02: `members` resource will be added to permissions.ts; this endpoint
	// should then RequireOrgPermission('members', 'update'). Today hasOrgPermission
	// is typed to patient|finance|settings only — settings:update is the temporary stand-in
	// (same documentation pattern as OrgPermissionGuard's AUDIT-02 API-key bypass note).
	@Patch(':id')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Sets absolute role to the caller-supplied value — repeat PATCHes converge to the same membership role. The audit-log row is append-only; a duplicate on a genuine retry is harmless.'
	)
	update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown
	) {
		const input = parseBody(memberRoleUpdateSchema, body, req);
		return this.membersService.updateRole(
			getActiveOrgId(req),
			id,
			input,
			getActorFromRequest(req)
		);
	}
}
