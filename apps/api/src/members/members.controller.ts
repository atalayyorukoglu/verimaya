import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
	@RequireOrgPermission('members', 'read')
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.membersService.list(getActiveOrgId(req), params);
	}

	@Patch(':id')
	@RequireOrgPermission('members', 'update')
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

	@Post(':id/password-reset')
	@RequireOrgPermission('members', 'update')
	@IdempotencyExempt(
		'Sends better-auth reset email; a retry may deliver a second mail. Harmless and expected.'
	)
	sendPasswordReset(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.membersService.sendPasswordResetEmail(
			getActiveOrgId(req),
			id,
			getActorFromRequest(req)
		);
	}
}
