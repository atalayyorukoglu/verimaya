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
	UnsupportedMediaTypeException,
	UseGuards
} from '@nestjs/common';
import {
	isAllowedContactFileMimeType,
	mergeRecordsSchema,
	contactCaseNoteCreateSchema,
	contactCreateSchema,
	contactFileCreateSchema,
	contactFilePresignSchema,
	contactListQuerySchema,
	contactsBulkTypeSchema,
	contactUpdateSchema
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
import { ContactsService } from './contacts.service';

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

/** RFC 6266 + RFC 5987 filename* for non-ASCII / quotes. */
function contentDispositionHeader(
	disposition: 'inline' | 'attachment',
	filename: string
): string {
	const asciiFallback = filename
		.replace(/[^\x20-\x7E]/g, '_')
		.replace(/["\\]/g, '_')
		.slice(0, 180);
	const safeAscii = asciiFallback.length > 0 ? asciiFallback : 'file';
	const encoded = encodeURIComponent(filename)
		.replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
	return `${disposition}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`;
}

@Controller('contacts')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ContactsController {
	constructor(
		private readonly contactsService: ContactsService,
		private readonly idempotency: IdempotencyService,
		private readonly webhookSubscriptions: WebhookSubscriptionsService
	) {}

	@Get()
	@RequireOrgPermission('contact', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(contactListQuerySchema, query, req);
		return this.contactsService.list(getActiveOrgId(req), params);
	}

	@Get('duplicate-groups')
	@RequireOrgPermission('contact', 'read')
	duplicateGroups(@Req() req: FastifyRequest) {
		return this.contactsService.duplicateGroups(getActiveOrgId(req));
	}

	@Post('merge')
	@RequireOrgPermission('contact', 'delete')
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
			'/v1/contacts/merge',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.mergeWithDb(db, tenantId, input, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}


	@Patch('bulk-type')
	@RequireOrgPermission('contact', 'update')
	@IdempotencyExempt(
		'Sets absolute contact_type_id on the given ids — repeat calls with the same body converge to the same rows.'
	)
	bulkSetType(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(contactsBulkTypeSchema, body, req);
		return this.contactsService.bulkSetType(getActiveOrgId(req), input);
	}

	@Get(':id/files')
	@RequireOrgPermission('contact', 'read')
	listFiles(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.listFiles(getActiveOrgId(req), id);
	}

	@Get(':id/case-notes')
	@RequireOrgPermission('contact', 'read')
	listCaseNotes(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.listCaseNotes(getActiveOrgId(req), id);
	}

	@Post(':id/case-notes')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async createCaseNote(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(contactCaseNoteCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contacts/:id/case-notes',
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.createCaseNoteWithDb(db, tenantId, id, input, {
					displayName: actor.actorDisplayName
				})
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id/case-notes/:noteId')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async deleteCaseNote(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('noteId') noteId: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/contacts/:id/case-notes/:noteId',
			async (db) => {
				await this.contactsService.deleteCaseNoteWithDb(db, id, noteId);
				return { statusCode: 204, body: null };
			}
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Get(':id/files/:fileId/download')
	@RequireOrgPermission('contact', 'read')
	async downloadFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string,
		@Res() reply: FastifyReply
	) {
		const download = await this.contactsService.openFileDownload(
			getActiveOrgId(req),
			id,
			fileId
		);
		reply.header('Content-Type', download.mimeType);
		reply.header('Content-Disposition', contentDispositionHeader('attachment', download.filename));
		reply.header('X-Content-Type-Options', 'nosniff');
		if (download.sizeBytes > 0) {
			reply.header('Content-Length', String(download.sizeBytes));
		}
		return reply.send(download.stream);
	}

	@Get(':id/files/:fileId/preview')
	@RequireOrgPermission('contact', 'read')
	async previewFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string,
		@Res() reply: FastifyReply
	) {
		const preview = await this.contactsService.openFilePreview(
			getActiveOrgId(req),
			id,
			fileId
		);
		reply.header('Content-Type', preview.mimeType);
		reply.header(
			'Content-Disposition',
			contentDispositionHeader(preview.disposition, preview.filename)
		);
		reply.header('X-Content-Type-Options', 'nosniff');
		if (preview.sizeBytes > 0) {
			reply.header('Content-Length', String(preview.sizeBytes));
		}
		return reply.send(preview.stream);
	}

	@Get(':id/finance-summary')
	@RequireOrgPermission('finance', 'read')
	financeSummary(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.financeSummary(getActiveOrgId(req), id);
	}

	@Post(':id/auto-link-transactions')
	@RequireOrgPermission('finance', 'update')
	@IdempotencyExempt(
		'Naturally idempotent by query: only contact-matched rows with contact_id IS NULL are updated; a repeat call finds nothing left to link and returns updated: 0.'
	)
	autoLinkTransactions(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.autoLinkTransactions(getActiveOrgId(req), id);
	}

	@Post(':id/files/presign')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async presignFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const input = parseBody(contactFilePresignSchema, body, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contacts/:id/files/presign',
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.presignFileWithDb(db, tenantId, id, input, {
					userId: actor.actorId,
					displayName: actor.actorDisplayName
				})
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Put(':id/files/:fileId/content')
	@RequireOrgPermission('contact', 'update')
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
		return this.contactsService.putFileContent(
			getActiveOrgId(req),
			id,
			fileId,
			data,
			contentType
		);
	}

	@Post(':id/files/:fileId/confirm')
	@RequireOrgPermission('contact', 'update')
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
			'/v1/contacts/:id/files/:fileId/confirm',
			async (_db) => ({
				statusCode: 200,
				body: await this.contactsService.confirmFile(tenantId, id, fileId)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	/** GAP-F09-23: soft-delete — same permission floor as upload (`contact:update`). */
	@Delete(':id/files/:fileId')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async deleteFile(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Param('fileId') fileId: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/contacts/:id/files/:fileId',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.softDeleteFileWithDb(
					db,
					tenantId,
					id,
					fileId,
					actor
				)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Post(':id/files')
	@RequireOrgPermission('contact', 'update')
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
			const declaredMime = part.mimetype || 'application/octet-stream';
			// AUDIT-F09-08: @fastify/multipart@10 has no allowedMimeTypes option — declared
			// MIME checked here; magic-byte sniff runs in uploadLocalFileWithDb.
			if (!isAllowedContactFileMimeType(declaredMime)) {
				throw new UnsupportedMediaTypeException({
					error: {
						code: 'unsupported_media_type',
						message: `MIME type not allowed: ${declaredMime}`
					}
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
				'/v1/contacts/:id/files',
				async (db) => ({
					statusCode: 201,
					body: await this.contactsService.uploadLocalFileWithDb(
						db,
						tenantId,
						id,
						{
							filename: part.filename || 'upload.bin',
							mimeType: declaredMime,
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

		const input = parseBody(contactFileCreateSchema, body, req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			`/v1/contacts/${id}/files`,
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.createFileWithDb(db, tenantId, id, input, {
					userId: actor.actorId,
					displayName: actor.actorDisplayName
				})
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Get(':id')
	@RequireOrgPermission('contact', 'read')
	get(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.get(getActiveOrgId(req), id);
	}

	@Post()
	@RequireOrgPermission('contact', 'create')
	@Idempotent()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(contactCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contacts',
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.createWithDb(db, tenantId, input)
			})
		);
		if (!result.replayed) {
			// Domain hook: fan out to tenant-configured outbound webhooks (Faz 6, best-effort).
			await this.webhookSubscriptions.enqueueOutbound(
				tenantId,
				'contact.created',
				result.body as unknown as Record<string, unknown>
			);
		}
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id')
	@RequireOrgPermission('contact', 'update')
	@Idempotent()
	async update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(contactUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			'/v1/contacts/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('contact', 'delete')
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
			'/v1/contacts/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.softDeleteWithDb(db, tenantId, id, actor)
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
