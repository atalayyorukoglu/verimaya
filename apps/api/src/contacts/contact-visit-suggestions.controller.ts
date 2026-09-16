import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import {
	contactVisitSuggestionApproveSchema,
	contactVisitSuggestionBulkDecideSchema,
	contactVisitSuggestionListQuerySchema,
	contactVisitSuggestionRejectSchema
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest,
	getIdempotencyKey
} from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { Idempotent } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody, parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ContactVisitSuggestionsService } from './contact-visit-suggestions.service';

/**
 * VIZIT-01 — WhatsApp'tan çıkarılan vizit önerilerinin onay kuyruğu.
 * Kişiye bağlı ama kişi kartının altında değil: kuyruk sayfası bütün bekleyen
 * önerileri tek listede gösteriyor (`/ai-transaction`).
 */
@Controller('contact-visit-suggestions')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ContactVisitSuggestionsController {
	constructor(
		private readonly suggestions: ContactVisitSuggestionsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('contact', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(contactVisitSuggestionListQuerySchema, query, req);
		return this.suggestions.list(getActiveOrgId(req), params);
	}

	/**
	 * Toplu onay. Ayrı bir uç, çünkü tekil onay yolu kişi başına gövde alıyor;
	 * burada gövde yalnız **eşik**. Kuyruk 400'ü aşınca tek tek onay telefondan
	 * yapılamaz hâle geldi.
	 *
	 * `:id/approve` ile çakışmaz: o iki segment, bu tek segment.
	 */
	@Post('approve-all')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async approveAll(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(contactVisitSuggestionBulkDecideSchema, body ?? {}, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contact-visit-suggestions/approve-all',
			async (db) => ({
				statusCode: 200,
				body: await this.suggestions.approveAllWithDb(db, tenantId, actor, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	/** Toplu yoksayma — düşük güvenli/kalan önerileri kuyruktan düşürür. */
	@Post('reject-all')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async rejectAll(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(contactVisitSuggestionBulkDecideSchema, body ?? {}, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contact-visit-suggestions/reject-all',
			async (db) => ({
				statusCode: 200,
				body: await this.suggestions.rejectAllWithDb(db, tenantId, actor, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post(':id/approve')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async approve(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(contactVisitSuggestionApproveSchema, body ?? {}, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contact-visit-suggestions/:id/approve',
			async (db) => ({
				statusCode: 200,
				body: await this.suggestions.approveWithDb(db, id, actor, input)
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
		const input = parseBody(contactVisitSuggestionRejectSchema, body ?? {}, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contact-visit-suggestions/:id/reject',
			async (db) => ({
				statusCode: 200,
				body: await this.suggestions.rejectWithDb(db, id, actor, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
