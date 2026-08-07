import {
	Controller,
	Headers,
	HttpCode,
	Post,
	Req,
	ServiceUnavailableException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { IdempotencyExempt } from '../common/idempotent.decorator';
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
@IdempotencyExempt(
	'Public, unauthenticated karne funnel — no tenant context. IdempotencyService is tenant-scoped (keys live in idempotency_keys under tenant_id RLS) and structurally does not apply here; LEG-02/1.2 already gate the higher-stakes leads endpoint separately.'
)
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
		// LEG-02: enabled when KARNE_LEADS_ENABLED=true (Coolify / .env); fail-closed otherwise
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
