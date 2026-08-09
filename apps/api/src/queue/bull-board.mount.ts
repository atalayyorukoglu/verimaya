import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter as BullBoardFastifyAdapter } from '@bull-board/fastify';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	type AdminQueueAuthOptions,
	isAdminQueueAuthorized,
	isAdminQueueSurfaceEnabled,
	sendAdminQueueUnauthorized
} from './admin-queue.auth';
import type { QueueService } from './queue.service';

export const BULL_BOARD_BASE_PATH = '/v1/admin/queues';

export type BullBoardMountOptions = AdminQueueAuthOptions;

export async function mountBullBoard(
	app: NestFastifyApplication,
	queueService: QueueService,
	options: BullBoardMountOptions
): Promise<void> {
	if (!isAdminQueueSurfaceEnabled(options)) {
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

		if (isAdminQueueAuthorized(request, options)) {
			return;
		}

		await sendAdminQueueUnauthorized(request, reply);
	});

	await fastify.register(serverAdapter.registerPlugin(), {
		prefix: BULL_BOARD_BASE_PATH
	});
}
