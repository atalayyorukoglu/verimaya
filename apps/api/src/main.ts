import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Readable } from 'node:stream';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { HttpException, HttpStatus } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from './auth/auth';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { initSentry } from './common/sentry';
import { mountOpenApiDocs } from './docs/openapi.mount';
import { MAX_UPLOAD_BYTES } from './storage/storage.types';
import { mountBullBoard } from './queue/bull-board.mount';
import { QueueService } from './queue/queue.service';
import type { WebhookRequestWithRawBody } from './webhooks/webhooks.signature';

/** CORS allowlist: panel origins + public web (karne / OAuth return). */
function corsOrigins(): string[] {
	const trusted = (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const publicWeb = process.env.WEB_PUBLIC_URL?.trim();
	return [...new Set([...trusted, ...(publicWeb ? [publicWeb] : [])])];
}

loadEnv({ path: '.env' });
initSentry();

/**
 * Capture exact request bytes for `/v1/webhooks/*` so HMAC can verify the
 * wire body (JSON.parse → stringify would break signatures).
 */
function registerWebhookRawBodyHook(app: NestFastifyApplication) {
	const fastify = app.getHttpAdapter().getInstance();
	fastify.addHook('preParsing', (request, _reply, payload, done) => {
		const path = request.url.split('?')[0] ?? '';
		if (!path.startsWith('/v1/webhooks')) {
			done(null, payload);
			return;
		}

		const chunks: Buffer[] = [];
		payload.on('data', (chunk: Buffer | string) => {
			chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
		});
		payload.on('end', () => {
			const raw = Buffer.concat(chunks);
			(request as WebhookRequestWithRawBody).rawBody = raw.toString('utf8');
			done(null, Readable.from(raw));
		});
		payload.on('error', (err: Error) => {
			done(err, undefined);
		});
	});
}

async function mountBetterAuth(app: NestFastifyApplication) {
	const auth = getAuth();
	const fastify = app.getHttpAdapter().getInstance();

	fastify.route({
		method: ['GET', 'POST'],
		url: '/v1/auth/*',
		// Custom flag for consumers; not part of FastifyContextConfig.
		config: { rawBody: true } as Record<string, unknown>,
		async handler(request: FastifyRequest, reply: FastifyReply) {
			const host = request.headers.host ?? 'localhost:3000';
			const url = new URL(request.url, `http://${host}`);
			const headers = new Headers();
			for (const [key, value] of Object.entries(request.headers)) {
				if (value === undefined || value === null) continue;
				if (Array.isArray(value)) {
					for (const v of value) headers.append(key, v);
				} else {
					headers.append(key, String(value));
				}
			}

			const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
			const init: RequestInit = {
				method: request.method,
				headers
			};
			if (hasBody) {
				init.body =
					typeof request.body === 'string'
						? request.body
						: JSON.stringify(request.body ?? {});
				if (!headers.has('content-type')) {
					headers.set('content-type', 'application/json');
				}
			}

			const response = await auth.handler(new Request(url.toString(), init));
			reply.status(response.status);

			const setCookies = response.headers.getSetCookie?.() ?? [];
			for (const cookie of setCookies) {
				reply.header('set-cookie', cookie);
			}

			response.headers.forEach((value, key) => {
				if (key.toLowerCase() === 'set-cookie') return;
				reply.header(key, value);
			});

			const text = await response.text();
			return reply.send(text.length ? text : null);
		}
	});
}

async function bootstrap() {
	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter({
			logger: {
				level: process.env.LOG_LEVEL ?? 'info'
			},
			// AUDIT-03 (Faz 8): JSON body cap is 1 MB; multipart `fileSize: 25 MB` below
			// handles actual uploads. Previously `MAX_UPLOAD_BYTES` (25 MB) was the body
			// cap, which combined with no rate-limit (main.ts:165) lets an
			// unauthenticated attacker OOM the worker via large JSON POSTs. Files use
			// multipart, not JSON, so the 1 MB cap is plenty for normal API payloads.
			bodyLimit: 1 * 1024 * 1024
		}),
		{ logger: false }
	);

	app.useGlobalFilters(new HttpExceptionFilter());

	app.enableCors({
		origin: corsOrigins(),
		credentials: true,
		methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Admin-Queue-Token'],
		exposedHeaders: ['set-auth-token']
	});

	// AUDIT-03 (Faz 8): cap multipart upload size. Magic-byte MIME sniff (file-type /
	// mmmagic) is the audit-recommended deeper defense and is deferred to AUDIT-F09-08.
	// For the pilot we rely on the client declaring the MIME type via the
	// `mime_type` field on `createFileWithDb`; the `binaryTypes` allowlist below
	// constrains what Fastify's content-type parser will accept, and a downstream
	// review-of-content on the patient's first file load is the operator's job.
	await app.register(multipart, {
		limits: { fileSize: MAX_UPLOAD_BYTES }
	});

	const fastify = app.getHttpAdapter().getInstance();
	const binaryTypes = [
		'application/octet-stream',
		'application/pdf',
		'image/png',
		'image/jpeg',
		'image/jpg',
		'image/webp',
		'image/gif'
	];
	for (const type of binaryTypes) {
		fastify.addContentTypeParser(
			type,
			{ parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES },
			(_req, body, done) => {
				done(null, body);
			}
		);
	}
	// AUDIT-03 (Faz 8): rate-limit. Two layers:
	//  1. Global: 600/min/IP for `/v1/*` (excludes the public karne surface, which
	//     keeps the original 30/min cap and stays unauthenticated).
	//  2. Tighter: 10/min/IP for `/v1/auth/*` to slow credential-stuffing on the
	//     better-auth login + password-reset endpoints.
	// Per-tenant token bucket (Redis-backed) is a follow-up for AUDIT-F09 — for the
	// pilot a per-IP cap is sufficient and uses no extra infra.
	await app.register(rateLimit, {
		global: true,
		max: 600,
		timeWindow: '1 minute',
		allowList: (req: FastifyRequest) => {
			const path = req.url.split('?')[0] ?? '';
			return !path.startsWith('/v1/public/karne');
		},
		errorResponseBuilder: (req: FastifyRequest, context) =>
			new HttpException(
				{
					error: { code: 'rate_limited', message: 'Too many requests' },
					request_id: String(req.id)
				},
				context.statusCode === 403 ? HttpStatus.FORBIDDEN : HttpStatus.TOO_MANY_REQUESTS
			)
	});
	// Tighter cap on auth surface — separate plugin instance, only counts /v1/auth/*.
	// The plugin applies to every route when global=true; for per-route scope the
	// cleaner pattern is a `keyGenerator` that returns a sentinel for non-auth paths,
	// so the bucket is never consumed but the 429 path is still wired.
	await app.register(rateLimit, {
		global: true,
		max: 10,
		timeWindow: '1 minute',
		keyGenerator: (req: FastifyRequest) => {
			const path = req.url.split('?')[0] ?? '';
			return path.startsWith('/v1/auth/') ? req.ip : `__skip__:${req.ip}`;
		},
		errorResponseBuilder: (req: FastifyRequest, context) =>
			new HttpException(
				{
					error: { code: 'rate_limited', message: 'Too many auth attempts' },
					request_id: String(req.id)
				},
				HttpStatus.TOO_MANY_REQUESTS
			)
	});

	app.setGlobalPrefix('v1');
	registerWebhookRawBodyHook(app);
	await mountBetterAuth(app);
	await mountOpenApiDocs(app);

	// AUDIT-03 (Faz 8): lock OpenAPI/Scalar mount. Production: requires
	// API_DOCS_TOKEN. Development: open. docs/TEHDIT-MODELI.md already calls
	// this out as a known reconnaissance vector; the lock here is the concrete
	// mitigation, gated on a single env var.
	const docsToken = process.env.API_DOCS_TOKEN?.trim();
	const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';
	await mountOpenApiDocs(app, {
		enabled: !isProduction || Boolean(docsToken),
		token: docsToken
	});

	await app.init();
	const queueService = app.get(QueueService);
	// AUDIT-03 (Faz 8): Bull Board is already token-gated in production by
	// `isBullBoardEnabled` (see `bull-board.mount.ts`); the call below passes
	// the same env vars. Documented here so the next reader knows we considered
	// the audit finding and that the existing check satisfies it.
	await mountBullBoard(app, queueService, {
		isDevelopment: (process.env.NODE_ENV ?? 'development') === 'development',
		adminQueueToken: process.env.ADMIN_QUEUE_TOKEN
	});

	// AUDIT-03 (Faz 8): wire Nest's shutdown hooks so SIGTERM (Coolify) drains the
	// BullMQ worker, closes Fastify, then exits. Without this, in-flight HTTP
	// requests and queue jobs die mid-step on every deploy.
	// docs/TEHDIT-MODELI.md does not cover this; per Coolify's 30s drain contract we
	// accept that some jobs will be killed and rely on `jobs` table idempotency
	// + at-least-once delivery to make that safe.
	app.enableShutdownHooks();

	const port = Number(process.env.API_PORT ?? 3000);
	await app.listen(port, '0.0.0.0');
}

void bootstrap();
