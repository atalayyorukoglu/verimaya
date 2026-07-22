import {
	BadRequestException,
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
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { WebhookSubscriptionsService } from '../webhook-subscriptions/webhook-subscriptions.service';
import { MAX_UPLOAD_BYTES } from './local-file-storage';
import { PatientsService } from './patients.service';

type MultipartRequest = FastifyRequest & {
	isMultipart?: () => boolean;
	file: () => Promise<{
		filename: string;
		mimetype: string;
		toBuffer: () => Promise<Buffer>;
		fields?: Record<string, unknown>;
	} | undefined>;
};

function multipartFieldString(field: unknown): string | null {
	const item = Array.isArray(field) ? field[0] : field;
	if (!item || typeof item !== 'object') return null;
	const value = (item as { value?: unknown }).value;
	return typeof value === 'string' && value.length > 0 ? value : null;
}

@Controller('patients')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard)
export class PatientsController {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly idempotency: IdempotencyService,
		private readonly webhookSubscriptions: WebhookSubscriptionsService
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

	@Get(':id/files/:fileId/download')
	async downloadFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string,
		@Res() reply: FastifyReply
	) {
		const download = await this.patientsService.openFileDownload(
			getActiveOrgId(req),
			id,
			fileId
		);
		reply.header('Content-Type', download.mimeType);
		reply.header(
			'Content-Disposition',
			`attachment; filename="${download.filename.replace(/"/g, '')}"`
		);
		reply.header('X-Content-Type-Options', 'nosniff');
		if (download.sizeBytes > 0) {
			reply.header('Content-Length', String(download.sizeBytes));
		}
		return reply.send(download.stream);
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
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const multipartReq = req as MultipartRequest;

		if (typeof multipartReq.isMultipart === 'function' && multipartReq.isMultipart()) {
			const part = await multipartReq.file();
			if (!part) {
				throw new BadRequestException({
					error: { code: 'validation_error', message: 'Expected multipart file field' }
				});
			}
			const data = await part.toBuffer();
			if (data.byteLength > MAX_UPLOAD_BYTES) {
				throw new BadRequestException({
					error: {
						code: 'validation_error',
						message: `File exceeds ${MAX_UPLOAD_BYTES} byte limit`
					}
				});
			}
			const appointmentId = multipartFieldString(part.fields?.appointment_id);

			const result = await this.idempotency.run(
				tenantId,
				getIdempotencyKey(req),
				'POST',
				`/v1/patients/${id}/files`,
				async (db) => ({
					statusCode: 201,
					body: await this.patientsService.uploadLocalFileWithDb(
						db,
						tenantId,
						id,
						{
							filename: part.filename || 'upload.bin',
							mimeType: part.mimetype || 'application/octet-stream',
							appointmentId,
							data
						},
						{
							userId: actor.actorId,
							displayName: actor.actorDisplayName
						}
					)
				})
			);
			reply.status(result.statusCode);
			return result.body;
		}

		const input = parseBody(patientFileCreateSchema, body, req);
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
		if (!result.replayed) {
			// Domain hook: fan out to tenant-configured outbound webhooks (Faz 6, best-effort).
			await this.webhookSubscriptions.enqueueOutbound(
				tenantId,
				'patient.created',
				result.body as unknown as Record<string, unknown>
			);
		}
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
