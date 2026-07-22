import {
	ArgumentsHost,
	Catch,
	ExceptionFilter,
	HttpException,
	HttpStatus
} from '@nestjs/common';
import type { ApiError } from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { captureException } from './sentry';

const STATUS_TO_CODE: Partial<Record<HttpStatus, string>> = {
	[HttpStatus.BAD_REQUEST]: 'bad_request',
	[HttpStatus.UNAUTHORIZED]: 'unauthorized',
	[HttpStatus.FORBIDDEN]: 'forbidden',
	[HttpStatus.NOT_FOUND]: 'not_found',
	[HttpStatus.CONFLICT]: 'conflict',
	[HttpStatus.UNPROCESSABLE_ENTITY]: 'validation_error',
	[HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited'
};

function isApiErrorBody(body: unknown): body is ApiError {
	if (!body || typeof body !== 'object') return false;
	const record = body as Record<string, unknown>;
	const error = record.error;
	if (!error || typeof error !== 'object') return false;
	const err = error as Record<string, unknown>;
	return typeof err.code === 'string' && typeof err.message === 'string';
}

function defaultCode(status: number): string {
	return STATUS_TO_CODE[status as HttpStatus] ?? 'internal_error';
}

function extractMessage(response: string | object): string {
	if (typeof response === 'string') return response;

	const record = response as Record<string, unknown>;
	if (isApiErrorBody(response)) return response.error.message;

	const message = record.message;
	if (typeof message === 'string') return message;
	if (Array.isArray(message)) {
		return message.map((item) => String(item)).join('; ');
	}

	return 'Unexpected error';
}

function extractCode(response: string | object, status: number): string {
	if (typeof response !== 'string' && isApiErrorBody(response)) {
		return response.error.code;
	}
	return defaultCode(status);
}

function extractRequestId(response: unknown, req: FastifyRequest): string {
	if (response && typeof response === 'object') {
		const requestId = (response as Record<string, unknown>).request_id;
		if (typeof requestId === 'string' && requestId.length > 0) {
			return requestId;
		}
	}
	return String(req.id);
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
	catch(exception: unknown, host: ArgumentsHost): void {
		const ctx = host.switchToHttp();
		const reply = ctx.getResponse<FastifyReply>();
		const req = ctx.getRequest<FastifyRequest>();

		let status = HttpStatus.INTERNAL_SERVER_ERROR;
		let responseBody: string | object | undefined;

		if (exception instanceof HttpException) {
			status = exception.getStatus();
			responseBody = exception.getResponse() as string | object;
		}

		const code =
			responseBody !== undefined ? extractCode(responseBody, status) : 'internal_error';
		const message =
			responseBody !== undefined
				? extractMessage(responseBody)
				: exception instanceof Error
					? exception.message
					: 'Internal server error';
		const safeMessage =
			status >= HttpStatus.INTERNAL_SERVER_ERROR && !(exception instanceof HttpException)
				? 'Internal server error'
				: message;
		const requestId = extractRequestId(responseBody, req);

		const payload: ApiError = {
			error: { code, message: safeMessage },
			request_id: requestId
		};

		if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
			req.log.error({ err: exception, request_id: requestId }, safeMessage);
			captureException(exception, { requestId });
		} else {
			req.log.warn({ request_id: requestId, error: payload.error }, safeMessage);
		}

		reply.status(status).send(payload);
	}
}
