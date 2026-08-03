import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Put,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	mergeRecordsSchema,
	patientCreateSchema,
	patientFileCreateSchema,
	patientFilePresignSchema,
	patientListQuerySchema,
	patientUpdateSchema
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest, getIdempotencyKey } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { Idempotent, IdempotencyExempt } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody, parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { WebhookSubscriptionsService } from '../webhook-subscriptions/webhook-subscriptions.service';
import { MAX_UPLOAD_BYTES } from '../storage/storage.types';
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
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class PatientsController {
	constructor(
		private readonly patientsService: PatientsService,
		private readonly idempotency: IdempotencyService,
		private readonly webhookSubscriptions: WebhookSubscriptionsService
	) {}

	@Get()
	@RequireOrgPermission('patient', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(patientListQuerySchema, query, req);
		return this.patientsService.list(getActiveOrgId(req), params);
	}

	@Get('duplicate-groups')
	@RequireOrgPermission('patient', 'read')
	duplicateGroups(@Req() req: FastifyRequest) {
		return this.patientsService.duplicateGroups(getActiveOrgId(req));
	}

	@Post('merge')
	@RequireOrgPermission('patient', 'delete')
	@Idempotent()
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
	@RequireOrgPermission('patient', 'read')
	listFiles(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.listFiles(getActiveOrgId(req), id);
	}

	@Get(':id/files/:fileId/download')
	@RequireOrgPermission('patient', 'read')
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
	@RequireOrgPermission('finance', 'read')
	financeSummary(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.financeSummary(getActiveOrgId(req), id);
	}

	@Post(':id/files/presign')
	@RequireOrgPermission('patient', 'update')
	@Idempotent()
	async presignFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(patientFilePresignSchema, body, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/patients/:id/files/presign',
			async (db) => ({
				statusCode: 201,
				body: await this.patientsService.presignFileWithDb(db, tenantId, id, input, {
					userId: actor.actorId,
					displayName: actor.actorDisplayName
				})
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Put(':id/files/:fileId/content')
	@RequireOrgPermission('patient', 'update')
	@IdempotencyExempt(
		'PUT of raw bytes onto an already-allocated fileId (from presign+confirm); re-uploading the same bytes overwrites the identical storage object — no duplicate-resource risk.'
	)
	async putFileContent(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string
	) {
		const data = coerceUploadBuffer(req.body);
		if (!data) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: 'Expected raw file body (application/octet-stream or image/*)'
				}
			});
		}
		const contentType = typeof req.headers['content-type'] === 'string'
			? req.headers['content-type']
			: undefined;
		return this.patientsService.putFileContent(
			getActiveOrgId(req),
			id,
			fileId,
			data,
			contentType
		);
	}

	@Post(':id/files/:fileId/confirm')
	@RequireOrgPermission('patient', 'update')
	@Idempotent()
	async confirmFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/patients/:id/files/:fileId/confirm',
			async (_db) => ({
				statusCode: 200,
				body: await this.patientsService.confirmFile(tenantId, id, fileId)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post(':id/files')
	@RequireOrgPermission('patient', 'update')
	@Idempotent()
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
				'/v1/patients/:id/files',
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
	@RequireOrgPermission('patient', 'read')
	get(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.patientsService.get(getActiveOrgId(req), id);
	}

	@Post()
	@RequireOrgPermission('patient', 'create')
	@Idempotent()
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
	@RequireOrgPermission('patient', 'update')
	@Idempotent()
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
			'/v1/patients/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.patientsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('patient', 'delete')
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
			'/v1/patients/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.patientsService.softDeleteWithDb(db, id)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}

function coerceUploadBuffer(body: unknown): Buffer | null {
	if (Buffer.isBuffer(body)) return body;
	if (body instanceof Uint8Array) return Buffer.from(body);
	if (typeof body === 'string' && body.length > 0) return Buffer.from(body);
	return null;
}
