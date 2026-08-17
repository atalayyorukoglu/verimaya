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
import {
	commissionEntryCreateSchema,
	commissionEntryListQuerySchema,
	commissionEntryUpdateSchema
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
import { CommissionsService } from './commissions.service';

@Controller('commissions')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class CommissionsController {
	constructor(
		private readonly commissionsService: CommissionsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('finance', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(commissionEntryListQuerySchema, query, req);
		return this.commissionsService.list(getActiveOrgId(req), params);
	}

	@Post()
	@RequireOrgPermission('finance', 'update')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(commissionEntryCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/commissions',
			async (db) => ({
				statusCode: 201,
				body: await this.commissionsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id')
	@RequireOrgPermission('finance', 'update')
	@Idempotent()
	async update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(commissionEntryUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			'/v1/commissions/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.commissionsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('finance', 'update')
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
			'/v1/commissions/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.commissionsService.softDeleteWithDb(db, tenantId, id, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
