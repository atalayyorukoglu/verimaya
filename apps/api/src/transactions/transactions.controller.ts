import {
	Body,
	Controller,
	Get,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import {
	cursorPageParams,
	transactionCreateSchema,
	transactionUpdateSchema
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getIdempotencyKey } from '../common/active-org.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class TransactionsController {
	constructor(
		private readonly transactionsService: TransactionsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.transactionsService.list(getActiveOrgId(req), params);
	}

	@Post()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(transactionCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/transactions',
			async (db) => ({
				statusCode: 201,
				body: await this.transactionsService.createWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch(':id')
	async update(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(transactionUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			`/v1/transactions/${id}`,
			async (db) => ({
				statusCode: 200,
				body: await this.transactionsService.updateWithDb(db, tenantId, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
