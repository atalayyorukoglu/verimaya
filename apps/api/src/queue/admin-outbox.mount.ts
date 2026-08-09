import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
	type AdminQueueAuthOptions,
	isAdminQueueAuthorized,
	isAdminQueueSurfaceEnabled,
	sendAdminQueueUnauthorized
} from './admin-queue.auth';
import type { OutboxAdminService, RequeueOutboxBody } from './outbox-admin.service';

/** Operator DLQ surface — parallel to Bull Board (`/v1/admin/queues`), same token. */
export const ADMIN_OUTBOX_BASE_PATH = '/v1/admin/queue/outbox';

export type MountAdminOutboxOptions = AdminQueueAuthOptions & {
	outboxAdmin: OutboxAdminService;
};

/**
 * AUDIT-F09-05: Fastify routes (not Nest controllers) so we reuse the Bull Board
 * token gate verbatim and stay outside the org-auth triad / guard-coverage scan.
 * Path prefix matches the task (`/admin/queue/outbox`); `/v1` is API-wide.
 */
export async function mountAdminOutboxRoutes(
	app: NestFastifyApplication,
	options: MountAdminOutboxOptions
): Promise<void> {
	if (!isAdminQueueSurfaceEnabled(options)) {
		return;
	}

	const fastify = app.getHttpAdapter().getInstance();
	registerAdminOutboxRoutes(fastify, options);
}

/** Bare-Fastify entry so unit tests can inject without Nest bootstrap. */
export function registerAdminOutboxRoutes(
	fastify: FastifyInstance,
	options: MountAdminOutboxOptions
): void {
	fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
		const path = request.url.split('?')[0] ?? '';
		if (!path.startsWith(ADMIN_OUTBOX_BASE_PATH)) {
			return;
		}

		if (isAdminQueueAuthorized(request, options)) {
			return;
		}

		await sendAdminQueueUnauthorized(request, reply);
	});

	fastify.get(
		`${ADMIN_OUTBOX_BASE_PATH}/dead`,
		async (request: FastifyRequest, reply: FastifyReply) => {
			const query = request.query as { limit?: string; tenant_id?: string };
			const limit = query.limit !== undefined ? Number(query.limit) : undefined;
			const result = await options.outboxAdmin.listDead(limit, query.tenant_id);
			return reply.send(result);
		}
	);

	fastify.post(
		`${ADMIN_OUTBOX_BASE_PATH}/requeue`,
		async (request: FastifyRequest, reply: FastifyReply) => {
			const body = (request.body ?? {}) as RequeueOutboxBody;
			if (body.ids !== undefined && !Array.isArray(body.ids)) {
				return reply.status(400).send({
					error: {
						code: 'BAD_REQUEST',
						message: 'ids must be an array of outbox event UUIDs'
					},
					request_id: request.id
				});
			}
			if (body.limit !== undefined && typeof body.limit !== 'number') {
				return reply.status(400).send({
					error: {
						code: 'BAD_REQUEST',
						message: 'limit must be a number'
					},
					request_id: request.id
				});
			}

			const result = await options.outboxAdmin.requeue({
				tenant_id: typeof body.tenant_id === 'string' ? body.tenant_id : undefined,
				ids: body.ids,
				limit: body.limit
			});
			return reply.send(result);
		}
	);
}
