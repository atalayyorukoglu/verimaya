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
import { apiKeyCreateSchema } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getIdempotencyKey
} from '../common/active-org.guard';
import { Idempotent } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ApiKeysService } from './api-keys.service';

@Controller('api-keys')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ApiKeysController {
	constructor(
		private readonly apiKeysService: ApiKeysService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('api_keys', 'read')
	list(@Req() req: FastifyRequest) {
		return this.apiKeysService.list(getActiveOrgId(req));
	}

	@Post()
	@RequireOrgPermission('api_keys', 'update')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(apiKeyCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/api-keys',
			async (db) => ({
				statusCode: 201,
				body: await this.apiKeysService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('api_keys', 'update')
	@Idempotent()
	async revoke(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/api-keys/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.apiKeysService.revokeWithDb(db, id)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
