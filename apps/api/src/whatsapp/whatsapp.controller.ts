import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams, whatsappParseRequestSchema } from '@verimaya/shared';
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

	@Get('inbox')
	listInbox(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.whatsappService.listInbox(getActiveOrgId(req), params);
	}

	@Get('inbox/:id')
	getInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.getInboxItem(getActiveOrgId(req), id);
	}
}
