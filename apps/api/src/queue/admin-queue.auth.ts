import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export const ADMIN_QUEUE_TOKEN_HEADER = 'x-admin-queue-token';

export type AdminQueueAuthOptions = {
	isDevelopment: boolean;
	adminQueueToken?: string;
};

export function isAdminQueueSurfaceEnabled(options: AdminQueueAuthOptions): boolean {
	return options.isDevelopment || Boolean(options.adminQueueToken?.trim());
}

/**
 * F-07 (Faz 7): constant-time compare so the admin queue token does not leak
 * via early-exit string equality. Length mismatch still runs a dummy compare.
 */
export function constantTimeEquals(a: string, b: string): boolean {
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	if (bufA.length !== bufB.length) {
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}

export function isAdminQueueAuthorized(
	request: FastifyRequest,
	options: AdminQueueAuthOptions
): boolean {
	if (options.isDevelopment) {
		return true;
	}

	const expected = options.adminQueueToken?.trim();
	if (!expected) {
		return false;
	}

	const header = request.headers[ADMIN_QUEUE_TOKEN_HEADER];
	return typeof header === 'string' && constantTimeEquals(header, expected);
}

export async function sendAdminQueueUnauthorized(
	request: FastifyRequest,
	reply: FastifyReply
): Promise<void> {
	await reply.status(401).send({
		error: {
			code: 'UNAUTHORIZED',
			message: 'Missing or invalid admin queue token'
		},
		request_id: request.id
	});
}
