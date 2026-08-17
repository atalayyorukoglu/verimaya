import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import { operationAlertCreateSchema, operationAlertListQuerySchema } from '@verimaya/shared';
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
import { OperationAlertsService } from './operation-alerts.service';

@Controller('operation-alerts')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class OperationAlertsController {
	constructor(
		private readonly operationAlertsService: OperationAlertsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('contact', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(operationAlertListQuerySchema, query, req);
		return this.operationAlertsService.list(getActiveOrgId(req), params);
	}

	@Post()
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(operationAlertCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/operation-alerts',
			async (db) => ({
				statusCode: 201,
				body: await this.operationAlertsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id/confirm')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async confirm(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			'/v1/operation-alerts/:id/confirm',
			async (db) => ({
				statusCode: 200,
				body: await this.operationAlertsService.confirmWithDb(db, id, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async remove(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/operation-alerts/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.operationAlertsService.softDeleteWithDb(db, tenantId, id, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
