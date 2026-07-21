import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { whatsappParseRequestSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { parseBody } from '../common/mappers';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class WhatsappController {
	constructor(private readonly whatsappService: WhatsappService) {}

	@Post('parse')
	async parse(@Req() req: FastifyRequest, @Body() body: unknown) {
		const { message } = parseBody(whatsappParseRequestSchema, body, req);
		const records = await this.whatsappService.parseMessage(getActiveOrgId(req), message);
		return { records };
	}
}
