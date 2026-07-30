import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
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
			}
		}),
		{ logger: false }
	);

	app.useGlobalFilters(new HttpExceptionFilter());

	app.enableCors({
		origin: corsOrigins(),
		credentials: true,
		exposedHeaders: ['set-auth-token']
	});

	await app.register(multipart, {
		limits: { fileSize: MAX_UPLOAD_BYTES }
	});

	// Unauthenticated karne write surface only — 30/min/IP (Adım 13).
	// Plugin throws errorResponseBuilder result; Nest filter needs HttpException for 429 body.
	await app.register(rateLimit, {
		global: true,
		max: 30,
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

	app.setGlobalPrefix('v1');
	await mountBetterAuth(app);
	await mountOpenApiDocs(app);

	await app.init();
	const queueService = app.get(QueueService);
	await mountBullBoard(app, queueService, {
		isDevelopment: (process.env.NODE_ENV ?? 'development') === 'development',
		adminQueueToken: process.env.ADMIN_QUEUE_TOKEN
	});

	const port = Number(process.env.API_PORT ?? 3000);
	await app.listen(port, '0.0.0.0');
}

void bootstrap();
