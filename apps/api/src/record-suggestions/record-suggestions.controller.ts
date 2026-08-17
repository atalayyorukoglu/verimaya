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
	recordUpdateSuggestionListQuerySchema,
	recordUpdateSuggestionParseRequestSchema,
	recordUpdateSuggestionRejectRequestSchema
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
import { RecordSuggestionsService } from './record-suggestions.service';

@Controller('record-suggestions')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class RecordSuggestionsController {
	constructor(
		private readonly recordSuggestionsService: RecordSuggestionsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('contact', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(recordUpdateSuggestionListQuerySchema, query, req);
		return this.recordSuggestionsService.list(getActiveOrgId(req), params);
	}

	@Post('parse')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		'Persists pending suggestions; duplicate appointment+field pending rows are skipped via partial unique index — retries may re-run LLM but cannot duplicate pending rows.'
	)
	parse(@Req() req: FastifyRequest, @Body() body: unknown) {
		const { message } = parseBody(recordUpdateSuggestionParseRequestSchema, body, req);
		return this.recordSuggestionsService.parse(getActiveOrgId(req), message);
	}

	@Post(':id/approve')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async approve(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/record-suggestions/:id/approve',
			async (db) => ({
				statusCode: 200,
				body: await this.recordSuggestionsService.approveWithDb(db, id, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post(':id/reject')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async reject(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(recordUpdateSuggestionRejectRequestSchema, body, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/record-suggestions/:id/reject',
			async (db) => ({
				statusCode: 200,
				body: await this.recordSuggestionsService.rejectWithDb(db, id, actor, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
