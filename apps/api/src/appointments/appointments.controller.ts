import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	appointmentCreateSchema,
	appointmentUpdateSchema,
	cursorPageParams
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getIdempotencyKey } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { WebhookSubscriptionsService } from '../webhook-subscriptions/webhook-subscriptions.service';
import { AppointmentsService } from './appointments.service';

@Controller('appointments')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class AppointmentsController {
	constructor(
		private readonly appointmentsService: AppointmentsService,
		private readonly idempotency: IdempotencyService,
		private readonly webhookSubscriptions: WebhookSubscriptionsService
	) {}

	@Get()
	@RequireOrgPermission('patient', 'read')
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.appointmentsService.list(getActiveOrgId(req), params);
	}

	@Post()
	@RequireOrgPermission('patient', 'create')
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(appointmentCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/appointments',
			async (db) => ({
				statusCode: 201,
				body: await this.appointmentsService.createWithDb(db, tenantId, input)
			})
		);
		if (!result.replayed) {
			// Domain hook: fan out to tenant-configured outbound webhooks (Faz 6, best-effort).
			await this.webhookSubscriptions.enqueueOutbound(
				tenantId,
				'appointment.created',
				result.body as unknown as Record<string, unknown>
			);
		}
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id')
	@RequireOrgPermission('patient', 'update')
	async update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(appointmentUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			`/v1/appointments/${id}`,
			async (db) => ({
				statusCode: 200,
				body: await this.appointmentsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
