import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_QUEUE_TOKEN_HEADER } from './admin-queue.auth';
import { ADMIN_OUTBOX_BASE_PATH, registerAdminOutboxRoutes } from './admin-outbox.mount';
import type { OutboxAdminService } from './outbox-admin.service';

describe('admin outbox mount auth (AUDIT-F09-05)', () => {
	afterEach(async () => {
		vi.restoreAllMocks();
	});

	async function buildApp(token = 'secret-token') {
		const outboxAdmin = {
			listDead: vi.fn(async () => ({ items: [] })),
			requeue: vi.fn(async () => ({ requeued: 0, ids: [] }))
		} as unknown as OutboxAdminService;

		const app = Fastify();
		registerAdminOutboxRoutes(app, {
			isDevelopment: false,
			adminQueueToken: token,
			outboxAdmin
		});
		await app.ready();
		return { app, outboxAdmin };
	}

	it('rejects missing admin token', async () => {
		const { app, outboxAdmin } = await buildApp();
		const res = await app.inject({
			method: 'GET',
			url: `${ADMIN_OUTBOX_BASE_PATH}/dead`
		});
		expect(res.statusCode).toBe(401);
		expect(res.json().error.code).toBe('UNAUTHORIZED');
		expect(outboxAdmin.listDead).not.toHaveBeenCalled();
		await app.close();
	});

	it('rejects wrong admin token', async () => {
		const { app, outboxAdmin } = await buildApp();
		const res = await app.inject({
			method: 'POST',
			url: `${ADMIN_OUTBOX_BASE_PATH}/requeue`,
			headers: { [ADMIN_QUEUE_TOKEN_HEADER]: 'nope' },
			payload: {}
		});
		expect(res.statusCode).toBe(401);
		expect(outboxAdmin.requeue).not.toHaveBeenCalled();
		await app.close();
	});

	it('allows correct admin token', async () => {
		const { app, outboxAdmin } = await buildApp('sekret');
		const res = await app.inject({
			method: 'GET',
			url: `${ADMIN_OUTBOX_BASE_PATH}/dead?limit=10`,
			headers: { [ADMIN_QUEUE_TOKEN_HEADER]: 'sekret' }
		});
		expect(res.statusCode).toBe(200);
		expect(outboxAdmin.listDead).toHaveBeenCalled();
		await app.close();
	});
});
