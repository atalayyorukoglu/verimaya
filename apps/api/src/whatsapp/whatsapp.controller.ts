import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { aiCorrectionCreateSchema, cursorPageParams, whatsappParseRequestSchema } from '@verimaya/shared';
import type { FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { AiCorrectionsService } from './ai-corrections.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class WhatsappController {
	constructor(
		private readonly whatsappService: WhatsappService,
		private readonly aiCorrectionsService: AiCorrectionsService
	) {}

	@Post('parse')
	@RequireOrgPermission('patient', 'create')
	async parse(@Req() req: FastifyRequest, @Body() body: unknown) {
		const { message } = parseBody(whatsappParseRequestSchema, body, req);
		const records = await this.whatsappService.parseMessage(getActiveOrgId(req), message);
		return { records };
	}

	@Get('inbox')
	@RequireOrgPermission('patient', 'read')
	listInbox(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.whatsappService.listInbox(getActiveOrgId(req), params);
	}

	@Get('inbox/:id')
	@RequireOrgPermission('patient', 'read')
	getInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.getInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/process')
	@RequireOrgPermission('patient', 'update')
	processInbox(@Req() req: FastifyRequest) {
		return this.whatsappService.processInbox(getActiveOrgId(req));
	}

	@Post('inbox/:id/parse')
	@RequireOrgPermission('patient', 'update')
	parseInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.parseInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/:id/approve')
	@RequireOrgPermission('patient', 'update')
	approveInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.approveInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/:id/ignore')
	@RequireOrgPermission('patient', 'update')
	ignoreInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.ignoreInboxItem(getActiveOrgId(req), id);
	}

	@Post('corrections')
	@RequireOrgPermission('patient', 'create')
	createCorrection(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(aiCorrectionCreateSchema, body, req);
		const actor = getActorFromRequest(req);
		return this.aiCorrectionsService.create(getActiveOrgId(req), input, actor.actorId);
	}

	@Get('corrections')
	@RequireOrgPermission('patient', 'read')
	listCorrections(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.aiCorrectionsService.list(getActiveOrgId(req), params);
	}
}
