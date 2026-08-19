import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { CSP_REPORT_MAX_BYTES } from './csp-reports.parse';

const CSP_REPORT_PATH = '/v1/csp-reports';
const CSP_CONTENT_TYPES = ['application/csp-report', 'application/reports+json'] as const;

function parseJsonOrRaw(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return raw;
	}
}

function isCspReportPost(request: FastifyRequest): boolean {
	const path = request.url.split('?')[0] ?? '';
	return request.method === 'POST' && path === CSP_REPORT_PATH;
}

/**
 * Cap POST /v1/csp-reports at ~8 KB regardless of Content-Type, and parse the
 * browser-specific CSP MIME types Fastify does not handle by default.
 */
export function registerCspReportParsers(fastify: FastifyInstance): void {
	fastify.addHook('preParsing', (request, _reply, payload, done) => {
		if (!isCspReportPost(request)) {
			done(null, payload);
			return;
		}

		const chunks: Buffer[] = [];
		let size = 0;
		let overflow = false;

		payload.on('data', (chunk: Buffer | string) => {
			if (overflow) return;
			const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
			size += buf.length;
			if (size > CSP_REPORT_MAX_BYTES) {
				overflow = true;
				payload.destroy();
				const err = Object.assign(new Error('Payload Too Large'), { statusCode: 413 });
				done(err, undefined);
				return;
			}
			chunks.push(buf);
		});
		payload.on('end', () => {
			if (overflow) return;
			done(null, Readable.from(Buffer.concat(chunks)));
		});
		payload.on('error', (err: Error) => {
			done(err, undefined);
		});
	});

	for (const type of CSP_CONTENT_TYPES) {
		fastify.addContentTypeParser(
			type,
			{ parseAs: 'string', bodyLimit: CSP_REPORT_MAX_BYTES },
			(_req, body, done) => {
				const raw = typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('utf8') : '';
				done(null, parseJsonOrRaw(raw));
			}
		);
	}
}
