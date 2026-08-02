import {
	Controller,
	Headers,
	HttpCode,
	Post,
	Req,
	ServiceUnavailableException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { parseBody } from '../common/mappers';
import {
	karneCompleteSchema,
	karneEventCreateSchema,
	karneLeadCreateSchema,
	karneSessionCreateSchema
} from './karne.schemas';
import { KarneService } from './karne.service';

function karneLeadsEnabled(): boolean {
	return process.env.KARNE_LEADS_ENABLED === 'true';
}

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

	@Post('leads')
	@HttpCode(204)
	async createLead(@Req() req: FastifyRequest) {
		// LEG-01: fail-closed until KVKK/legal approval sets KARNE_LEADS_ENABLED=true
		if (!karneLeadsEnabled()) {
			throw new ServiceUnavailableException({
				error: {
					code: 'karne_leads_disabled',
					message: 'Karne lead capture is disabled pending legal approval'
				}
			});
		}
		const body = parseBody(karneLeadCreateSchema, req.body, req);
		await this.karne.createLead(body);
	}
}
