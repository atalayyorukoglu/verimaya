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
	mergeRecordsSchema,
	patientCreateSchema,
	patientFileCreateSchema,
	patientUpdateSchema,
	searchableListParams
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest, getIdempotencyKey } from '../common/active-org.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { SessionGuard } from '../auth/session.guard';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class PatientsController {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string,
		@Query('q') q?: string
	) {
		const params = searchableListParams.parse({ cursor, limit, q });
		return this.patientsService.list(getActiveOrgId(req), params);
	}

	@Get('duplicate-groups')
	duplicateGroups(@Req() req: FastifyRequest) {
		return this.patientsService.duplicateGroups(getActiveOrgId(req));
	}

	@Post('merge')
	async merge(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(mergeRecordsSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/patients/merge',
			async (db) => ({
				statusCode: 200,
				body: await this.patientsService.mergeWithDb(db, tenantId, input, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Get(':id/files')
	listFiles(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.listFiles(getActiveOrgId(req), id);
	}

	@Get(':id/finance-summary')
	financeSummary(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.financeSummary(getActiveOrgId(req), id);
	}

	@Post(':id/files')
	async createFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(patientFileCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			`/v1/patients/${id}/files`,
			async (db) => ({
				statusCode: 201,
				body: await this.patientsService.createFileWithDb(db, tenantId, id, input, {
					userId: actor.actorId,
					displayName: actor.actorDisplayName
				})
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Get(':id')
	get(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.get(getActiveOrgId(req), id);
	}

	@Post()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(patientCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/patients',
			async (db) => ({
				statusCode: 201,
				body: await this.patientsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id')
	async update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(patientUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			`/v1/patients/${id}`,
			async (db) => ({
				statusCode: 200,
				body: await this.patientsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
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
			`/v1/patients/${id}`,
			async (db) => ({
				statusCode: 200,
				body: await this.patientsService.softDeleteWithDb(db, id)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
