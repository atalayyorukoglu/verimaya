import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { QueueService } from '../queue/queue.service';

/**
 * CI smoke: readiness (Postgres + Redis) and a noop job through the in-process worker.
 * Requires REDIS_URL and DATABASE_URL_APP (or DATABASE_URL).
 */
describe('queue / readiness smoke', () => {
	let app: NestFastifyApplication;

	beforeAll(async () => {
		process.env.REDIS_URL ??= 'redis://localhost:6379';
		process.env.DATABASE_URL_APP ??=
			process.env.DATABASE_URL ?? 'postgresql://verimaya_app:verimaya@localhost:5433/verimaya';
		process.env.DATABASE_URL ??= process.env.DATABASE_URL_APP;
		process.env.BETTER_AUTH_SECRET ??= 'ci-test-secret-must-be-at-least-32-chars';
		process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
		process.env.TRUSTED_ORIGINS ??= 'http://localhost:5173';
		process.env.CREDENTIALS_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('hex');

		app = await NestFactory.create<NestFastifyApplication>(
			AppModule,
			new FastifyAdapter(),
			{ logger: false }
		);
		app.setGlobalPrefix('v1');
		await app.init();
	}, 60_000);

	afterAll(async () => {
		await app?.close();
	});

	it('GET /v1/health/ready returns 200 with postgres and redis ok', async () => {
		const res = await app.inject({
			method: 'GET',
			url: '/v1/health/ready'
		});

		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body) as {
			status: string;
			checks: { postgres: string; redis: string };
		};
		expect(body.status).toBe('ready');
		expect(body.checks).toEqual({ postgres: 'ok', redis: 'ok' });
	});

	it('enqueues a noop job that the worker completes', async () => {
		const queue = app.get(QueueService);
		const jobId = randomUUID();
		const job = await queue.enqueueDefaultJob('ci.smoke.noop', {
			jobId,
			tenantId: randomUUID(),
			jobType: 'ci.smoke.noop'
		});

		const deadline = Date.now() + 10_000;
		let state = await job.getState();
		while (state !== 'completed' && state !== 'failed' && Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, 100));
			state = await job.getState();
		}

		expect(state).toBe('completed');
	});
});
