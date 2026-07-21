import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from './session.guard';

@Controller('me')
export class MeController {
	@Get()
	@UseGuards(SessionGuard)
	me(@Req() req: FastifyRequest) {
		const session = req.authSession!;
		return {
			user: {
				id: session.user.id,
				email: session.user.email,
				name: session.user.name,
				two_factor_enabled: session.user.twoFactorEnabled ?? false
			},
			session: {
				active_organization_id: session.session.activeOrganizationId ?? null
			}
		};
	}
}
