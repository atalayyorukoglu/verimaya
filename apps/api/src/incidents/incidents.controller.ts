import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { incidentCreateSchema, incidentListQuerySchema } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getIdempotencyKey } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { Idempotent } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody, parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { IncidentsService } from './incidents.service';

/**
 * Giriş noktası hasta dosyasından tek tıkla — bkz. apps/web contacts/[id] sayfası
 * ve docs/2026-08-23-maya-icgoru-sorulari.md § 5 "üç şart".
 */
@Controller('incidents')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class IncidentsController {
	constructor(
		private readonly incidentsService: IncidentsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('contact', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(incidentListQuerySchema, query, req);
		return this.incidentsService.list(getActiveOrgId(req), params);
	}

	@Post()
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(incidentCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/incidents',
			async (db) => ({
				statusCode: 201,
				body: await this.incidentsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id/resolve')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async resolve(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			'/v1/incidents/:id/resolve',
			async (db) => ({
				statusCode: 200,
				body: await this.incidentsService.resolveWithDb(db, id)
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
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/incidents/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.incidentsService.softDeleteWithDb(id, tenantId, db)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
