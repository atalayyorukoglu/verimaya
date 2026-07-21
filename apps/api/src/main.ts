import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from './auth/auth';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { mountBullBoard } from './queue/bull-board.mount';
import { QueueService } from './queue/queue.service';

loadEnv({ path: '.env' });

async function mountBetterAuth(app: NestFastifyApplication) {
	const auth = getAuth();
	const fastify = app.getHttpAdapter().getInstance();

	fastify.route({
		method: ['GET', 'POST'],
		url: '/v1/auth/*',
		config: {
			rawBody: true
		},
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
		origin: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173')
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean),
		credentials: true
	});

	app.setGlobalPrefix('v1');
	await mountBetterAuth(app);

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
