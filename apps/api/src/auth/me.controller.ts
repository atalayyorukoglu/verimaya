import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from './session.guard';
import { MeService } from './me.service';

@Controller('me')
export class MeController {
	constructor(private readonly meService: MeService) {}

	@Get()
	@UseGuards(SessionGuard)
	me(@Req() req: FastifyRequest) {
		const session = req.authSession!;
		return this.meService.resolveMembershipUser({
			userId: session.user.id,
			activeOrganizationId: session.session.activeOrganizationId,
			requestId: String(req.id)
		});
	}
}
