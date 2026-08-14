import {
	BadRequestException,
	Body,
	Controller,
	Get,
	PayloadTooLargeException,
	Post,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { importCommitBodySchema, IMPORT_MAX_UPLOAD_BYTES } from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest,
	getIdempotencyKey
} from '../common/active-org.guard';
import { Idempotent, IdempotencyExempt } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ImportExportService } from './import-export.service';

type MultipartRequest = FastifyRequest & {
	isMultipart?: () => boolean;
	file: () => Promise<
		| {
				toBuffer: () => Promise<Buffer>;
				mimetype?: string;
				filename?: string;
		  }
		| undefined
	>;
};

function contentDispositionHeader(disposition: 'attachment', filename: string): string {
	const safe = filename.replace(/["\\\r\n]/g, '_');
	return `${disposition}; filename="${safe}"`;
}

@Controller('settings/import-export')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ImportExportController {
	constructor(
		private readonly importExport: ImportExportService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get('contacts/template.xlsx')
	@RequireOrgPermission('settings', 'read')
	@IdempotencyExempt('Binary template download — no mutation.')
	async contactsTemplate(@Res({ passthrough: true }) reply: FastifyReply) {
		const file = await this.importExport.contactsTemplate();
		reply.header('Content-Type', file.mimeType);
		reply.header('Content-Disposition', contentDispositionHeader('attachment', file.filename));
		reply.header('X-Content-Type-Options', 'nosniff');
		reply.header('Content-Length', String(file.buffer.byteLength));
		return file.buffer;
	}

	@Get('contacts/export.xlsx')
	@RequireOrgPermission('settings', 'read')
	@IdempotencyExempt('Binary export download — no mutation.')
	async contactsExport(
		@Req() req: FastifyRequest,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const file = await this.importExport.contactsExport(getActiveOrgId(req));
		reply.header('Content-Type', file.mimeType);
		reply.header('Content-Disposition', contentDispositionHeader('attachment', file.filename));
		reply.header('X-Content-Type-Options', 'nosniff');
		reply.header('Content-Length', String(file.buffer.byteLength));
		return file.buffer;
	}

	@Post('contacts/import/dry-run')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Dry-run parses untrusted upload and returns a signed plan; no DB writes — repeat is safe.'
	)
	async contactsDryRun(@Req() req: FastifyRequest) {
		const data = await this.readUpload(req);
		return this.importExport.contactsDryRun(getActiveOrgId(req), data);
	}

	@Post('contacts/import/commit')
	@RequireOrgPermission('settings', 'update')
	@Idempotent()
	async contactsCommit(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(importCommitBodySchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/settings/import-export/contacts/import/commit',
			async (db) => ({
				statusCode: 200,
				body: await this.importExport.contactsCommitWithDb(db, tenantId, input.plan_token, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	private async readUpload(req: FastifyRequest): Promise<Buffer> {
		const multipartReq = req as MultipartRequest;
		if (typeof multipartReq.isMultipart !== 'function' || !multipartReq.isMultipart()) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: 'Expected multipart file field'
				}
			});
		}
		const part = await multipartReq.file();
		if (!part) {
			throw new BadRequestException({
				error: {
					code: 'validation_error',
					message: 'Expected multipart file field'
				}
			});
		}
		const data = await part.toBuffer();
		if (data.byteLength > IMPORT_MAX_UPLOAD_BYTES) {
			throw new PayloadTooLargeException({
				error: {
					code: 'file_too_large',
					message: `Import file exceeds ${IMPORT_MAX_UPLOAD_BYTES} byte limit`
				}
			});
		}
		return data;
	}
}
