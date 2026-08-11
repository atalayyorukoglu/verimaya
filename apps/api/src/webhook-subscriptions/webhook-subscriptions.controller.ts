import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Post,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import { webhookSubscriptionCreateSchema } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getIdempotencyKey } from '../common/active-org.guard';
import { Idempotent } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';

/**
 * Session-only settings CRUD — external API keys never manage a tenant's own
 * outbound webhook destinations (Faz 6).
 */
@Controller('webhook-subscriptions')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class WebhookSubscriptionsController {
	constructor(
		private readonly webhookSubscriptionsService: WebhookSubscriptionsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('webhook_subscriptions', 'read')
	list(@Req() req: FastifyRequest) {
		return this.webhookSubscriptionsService.list(getActiveOrgId(req));
	}

	@Post()
	@RequireOrgPermission('webhook_subscriptions', 'update')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(webhookSubscriptionCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/webhook-subscriptions',
			async (db) => ({
				statusCode: 201,
				body: await this.webhookSubscriptionsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('webhook_subscriptions', 'update')
	@Idempotent()
	async remove(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/webhook-subscriptions/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.webhookSubscriptionsService.removeWithDb(db, tenantId, id)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
