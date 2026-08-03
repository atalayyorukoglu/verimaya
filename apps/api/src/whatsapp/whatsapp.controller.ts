import {
	Body,
	Controller,
	Get,
	Param,
	Post,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	aiCorrectionCreateSchema,
	approveDraftsRequestSchema,
	cursorPageParams,
	whatsappParseRequestSchema
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest,
	getIdempotencyKey
} from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { IdempotencyService } from '../common/idempotency.service';
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
		private readonly aiCorrectionsService: AiCorrectionsService,
		private readonly idempotency: IdempotencyService
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

	/**
	 * MONEY-01: atomic approve — transactions + optional correction + inbox status
	 * in one DB transaction, keyed by Idempotency-Key.
	 */
	@Post('inbox/:id/approve-drafts')
	@RequireOrgPermission('finance', 'create')
	async approveDrafts(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(approveDraftsRequestSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			`/v1/whatsapp/inbox/${id}/approve-drafts`,
			async (db) => ({
				statusCode: 201,
				body: await this.whatsappService.approveDraftsWithDb(
					db,
					tenantId,
					id,
					input,
					actor.actorId
				)
			})
		);
		reply.status(result.statusCode);
		return result.body;
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
