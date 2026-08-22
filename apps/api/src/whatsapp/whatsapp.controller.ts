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
	aiCorrectionsReportParamsSchema,
	approveDraftsRequestSchema,
	cursorPageParams,
	whatsappCreateCategorySchema,
	whatsappCreateContactSchema,
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
import { Idempotent, IdempotencyExempt } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody, parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ContactsService } from '../contacts/contacts.service';
import { SettingsService } from '../settings/settings.service';
import { AiCorrectionsService } from './ai-corrections.service';
import { WhatsappService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class WhatsappController {
	constructor(
		private readonly whatsappService: WhatsappService,
		private readonly aiCorrectionsService: AiCorrectionsService,
		private readonly contactsService: ContactsService,
		private readonly settingsService: SettingsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Post('parse')
	@RequireOrgPermission('contact', 'create')
	@IdempotencyExempt(
		'Stateless LLM preview parse — returns draft suggestions without persisting a domain record (only a best-effort usage ledger write); nothing for a retry to duplicate.'
	)
	async parse(@Req() req: FastifyRequest, @Body() body: unknown) {
		const { message } = parseBody(whatsappParseRequestSchema, body, req);
		const records = await this.whatsappService.parseMessage(getActiveOrgId(req), message);
		return { records };
	}

	@Get('inbox')
	@RequireOrgPermission('contact', 'read')
	listInbox(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.whatsappService.listInbox(getActiveOrgId(req), params);
	}

	@Get('inbox/:id')
	@RequireOrgPermission('contact', 'read')
	getInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.getInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/process')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		"Naturally idempotent by query, not by key: only status='new' rows are parsed (see WhatsappService.processInbox), so re-running after a partial/retried call just skips rows already moved past 'new'."
	)
	processInbox(@Req() req: FastifyRequest) {
		return this.whatsappService.processInbox(getActiveOrgId(req));
	}

	@Post('inbox/:id/parse')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		'Re-parse overwrites the same inbox row\'s payload.parsed_records in place — no new resource is created, so a retry cannot duplicate anything (it can only re-run the LLM call).'
	)
	parseInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.parseInboxItem(getActiveOrgId(req), id);
	}

	@Post('inbox/:id/approve')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		"Sets inbox status to a fixed value ('approved'); PUT-like semantics — repeat calls converge to the same state. (Not the money path: that's approve-drafts below.)"
	)
	approveInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.approveInboxItem(getActiveOrgId(req), id);
	}

	/**
	 * MONEY-01: atomic approve — transactions + optional correction + inbox status
	 * in one DB transaction, keyed by Idempotency-Key.
	 */
	@Post('inbox/:id/approve-drafts')
	@RequireOrgPermission('finance', 'create')
	@Idempotent()
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
			'/v1/whatsapp/inbox/:id/approve-drafts',
			async (db) => ({
				statusCode: 201,
				body: await this.whatsappService.approveDraftsWithDb(
					db,
					tenantId,
					id,
					input,
					actor
				)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post('inbox/:id/ignore')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		"Sets inbox status to a fixed value ('ignored'); PUT-like semantics — repeat calls converge to the same state."
	)
	ignoreInboxItem(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.whatsappService.ignoreInboxItem(getActiveOrgId(req), id);
	}

	/**
	 * GAP-F09-16: inline contact create from draft approval (thin wrap of ContactsService.create).
	 */
	@Post('create-contact')
	@RequireOrgPermission('contact', 'create')
	@Idempotent()
	async createContact(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(whatsappCreateContactSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/whatsapp/create-contact',
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	/**
	 * GAP-F09-16: inline finance category create from draft approval.
	 * Permission is finance:create (not settings:update) — same rationale as approve-drafts:
	 * this is a finance ops assist on the AI import path, not a settings-admin action.
	 * No create-subcategory: category model is flat.
	 */
	@Post('create-category')
	@RequireOrgPermission('finance', 'create')
	@Idempotent()
	async createCategory(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(whatsappCreateCategorySchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/whatsapp/create-category',
			async (db) => ({
				statusCode: 201,
				body: await this.settingsService.createFinanceCategoryWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post('corrections')
	@RequireOrgPermission('contact', 'create')
	@IdempotencyExempt(
		'Standalone correction-log write, not called by the web client today (corrections are created atomically inside approve-drafts — MONEY-01); reachable only via direct API/API-key access. ai_corrections is a diff/analytics log, not a financial or domain record, so a duplicate row on retry is a data-quality nit, not a customer-facing risk. Wire this like createFinanceCategory (below) if/when a real caller appears.'
	)
	createCorrection(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(aiCorrectionCreateSchema, body, req);
		const actor = getActorFromRequest(req);
		return this.aiCorrectionsService.create(getActiveOrgId(req), input, actor.actorId);
	}

	@Get('corrections')
	@RequireOrgPermission('contact', 'read')
	listCorrections(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.aiCorrectionsService.list(getActiveOrgId(req), params);
	}

	/** GAP-F09-15: field-level AI correction frequency (full period, no pagination). */
	@Get('corrections-report')
	@RequireOrgPermission('contact', 'read')
	correctionsReport(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(aiCorrectionsReportParamsSchema, query, req);
		return this.aiCorrectionsService.report(getActiveOrgId(req), params);
	}
}
