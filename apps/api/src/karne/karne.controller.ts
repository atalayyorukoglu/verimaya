import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parseBody } from '../common/mappers';
import {
	karneCompleteSchema,
	karneEventCreateSchema,
	karneSessionCreateSchema
} from './karne.schemas';
import { KarneService } from './karne.service';

/**
 * Unauthenticated public write surface for the free AI scorecard funnel.
 * No AuthOrApiKeyGuard, no tenant context — writes only `karne_*` tables.
 */
@Controller('public/karne')
export class KarneController {
	constructor(private readonly karne: KarneService) {}

	@Post('sessions')
	@HttpCode(200)
	createSession(
		@Req() req: FastifyRequest,
		@Headers('user-agent') userAgent?: string
	) {
		const body = parseBody(karneSessionCreateSchema, req.body, req);
		return this.karne.createSession(body, { userAgent });
	}

	@Post('events')
	@HttpCode(202)
	async createEvent(@Req() req: FastifyRequest) {
		const body = parseBody(karneEventCreateSchema, req.body, req);
		await this.karne.recordEvent(body);
		return { accepted: true };
	}

	@Post('complete')
	@HttpCode(204)
	async complete(@Req() req: FastifyRequest) {
		const body = parseBody(karneCompleteSchema, req.body, req);
		await this.karne.complete(body);
	}
}
