import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { MembersService } from './members.service';

@Controller('members')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class MembersController {
	constructor(private readonly membersService: MembersService) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.membersService.list(getActiveOrgId(req), params);
	}
}
