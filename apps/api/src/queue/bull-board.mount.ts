import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { QueueService } from './queue.service';

export const BULL_BOARD_BASE_PATH = '/v1/admin/queues';
const ADMIN_QUEUE_TOKEN_HEADER = 'x-admin-queue-token';

export type BullBoardMountOptions = {
	isDevelopment: boolean;
	adminQueueToken?: string;
};

function isBullBoardEnabled(options: BullBoardMountOptions): boolean {
	return options.isDevelopment || Boolean(options.adminQueueToken?.trim());
}

function isAuthorized(request: FastifyRequest, options: BullBoardMountOptions): boolean {
	if (options.isDevelopment) {
		return true;
	}

	const expected = options.adminQueueToken?.trim();
	if (!expected) {
		return false;
	}

	const header = request.headers[ADMIN_QUEUE_TOKEN_HEADER];
	return typeof header === 'string' && header === expected;
}

export async function mountBullBoard(
	app: NestFastifyApplication,
	queueService: QueueService,
	options: BullBoardMountOptions
): Promise<void> {
	if (!isBullBoardEnabled(options)) {
		return;
	}

	const queue = queueService.getDefaultQueue();
	if (!queue) {
		return;
	}

	const serverAdapter = new BullBoardFastifyAdapter();
	serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

	createBullBoard({
		queues: [new BullMQAdapter(queue)],
		serverAdapter
	});

	const fastify = app.getHttpAdapter().getInstance();

	fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
		if (!request.url.startsWith(BULL_BOARD_BASE_PATH)) {
			return;
		}

		if (isAuthorized(request, options)) {
			return;
		}

		await reply.status(401).send({
			error: {
				code: 'UNAUTHORIZED',
				message: 'Missing or invalid admin queue token'
			},
			request_id: request.id
		});
	});

	await fastify.register(serverAdapter.registerPlugin(), {
		prefix: BULL_BOARD_BASE_PATH
	});
}
