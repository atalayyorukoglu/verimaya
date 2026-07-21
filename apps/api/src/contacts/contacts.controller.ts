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
	contactCreateSchema,
	contactUpdateSchema,
	cursorPageParams
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getIdempotencyKey } from '../common/active-org.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { ContactsService } from './contacts.service';

@Controller('contacts')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class ContactsController {
	constructor(
		private readonly contactsService: ContactsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	list(
		@Req() req: FastifyRequest,
		@Query('cursor') cursor?: string,
		@Query('limit') limit?: string
	) {
		const params = cursorPageParams.parse({ cursor, limit });
		return this.contactsService.list(getActiveOrgId(req), params);
	}

	@Get(':id')
	get(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.get(getActiveOrgId(req), id);
	}

	@Post()
	async create(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(contactCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contacts',
			async (db) => ({
				statusCode: 201,
				body: await this.contactsService.createWithDb(db, tenantId, input)
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
		const input = parseBody(contactUpdateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'PATCH',
			`/v1/contacts/${id}`,
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
