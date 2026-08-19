import {
	Controller,
	Delete,
	Get,
	HttpCode,
	PayloadTooLargeException,
	Post,
	Req,
	UseGuards
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { IdempotencyExempt } from '../common/idempotent.decorator';
import { PlatformAdminGuard } from '../platform/platform-admin.guard';
import { CSP_REPORT_MAX_BYTES } from './csp-reports.parse';
import { CspReportsService } from './csp-reports.service';

function contentLengthBytes(req: FastifyRequest): number | null {
	const raw = req.headers['content-length'];
	if (raw === undefined) return null;
	const value = Array.isArray(raw) ? raw[0] : raw;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function serializedBodyBytes(body: unknown): number {
	if (body == null) return 0;
	if (typeof body === 'string') return Buffer.byteLength(body);
	if (Buffer.isBuffer(body)) return body.length;
	try {
		return Buffer.byteLength(JSON.stringify(body));
	} catch {
		return 0;
	}
}

@Controller('csp-reports')
export class CspReportsController {
	constructor(private readonly cspReports: CspReportsService) {}

	/**
	 * Browser CSP reporting endpoint — no session by design.
	 * The reporting document is the panel SPA; the browser POSTs here without cookies
	 * when the report-uri is same-origin (or via the web nginx proxy in production).
	 * Auth would drop every report. Abuse controls: body size, rate-limit, URI strip.
	 */
	@Post()
	@HttpCode(204)
	@IdempotencyExempt(
		'Unauthenticated browser CSP reports — no tenant, no idempotency_keys row; duplicates are aggregated in csp_reports.count.'
	)
	async ingest(@Req() req: FastifyRequest): Promise<void> {
		const declared = contentLengthBytes(req);
		if (declared !== null && declared > CSP_REPORT_MAX_BYTES) {
			throw new PayloadTooLargeException({
				error: { code: 'payload_too_large', message: 'CSP report exceeds size limit' },
				request_id: req.id
			});
		}
		if (serializedBodyBytes(req.body) > CSP_REPORT_MAX_BYTES) {
			throw new PayloadTooLargeException({
				error: { code: 'payload_too_large', message: 'CSP report exceeds size limit' },
				request_id: req.id
			});
		}
		const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
		try {
			await this.cspReports.ingest(req.body, ua);
		} catch {
			// Broken payloads must not 5xx — the browser cannot act on the error.
		}
	}

	@Get()
	@UseGuards(SessionGuard, PlatformAdminGuard)
	list() {
		return this.cspReports.list();
	}

	@Delete()
	@HttpCode(200)
	@UseGuards(SessionGuard, PlatformAdminGuard)
	@IdempotencyExempt('Platform-admin clear of aggregated CSP rows — full truncate, not a keyed mutation.')
	clear() {
		return this.cspReports.clear();
	}
}
