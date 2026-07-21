import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { cursorPageParams, whatsappParseRequestSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { parseBody } from '../common/mappers';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard)
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

	@Post('inbox/process')
	processInbox(@Req() req: FastifyRequest) {
		return this.whatsappService.processInbox(getActiveOrgId(req));
	}

	@Post('inbox/:id/parse')
	parseInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.parseInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/:id/approve')
	approveInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.approveInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/:id/ignore')
	ignoreInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.ignoreInboxItem(getActiveOrgId(req), id);
	}
}
