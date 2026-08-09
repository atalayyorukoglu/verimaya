import {
	Body,
	Controller,
	Delete,
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
	contactListQuerySchema,
	contactsBulkTypeSchema,
	contactUpdateSchema,
	mergeRecordsSchema
} from '@verimaya/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest, getIdempotencyKey } from '../common/active-org.guard';
import { AuthOrApiKeyGuard } from '../common/auth-or-api-key.guard';
import { Idempotent, IdempotencyExempt } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody, parseQuery } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { ContactsService } from './contacts.service';

@Controller('contacts')
@UseGuards(AuthOrApiKeyGuard, ActiveOrgGuard, OrgPermissionGuard)
export class ContactsController {
	constructor(
		private readonly contactsService: ContactsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get()
	@RequireOrgPermission('patient', 'read')
	list(@Req() req: FastifyRequest, @Query() query: Record<string, unknown>) {
		const params = parseQuery(contactListQuerySchema, query, req);
		return this.contactsService.list(getActiveOrgId(req), params);
	}

	@Get('duplicate-groups')
	@RequireOrgPermission('patient', 'read')
	duplicateGroups(@Req() req: FastifyRequest) {
		return this.contactsService.duplicateGroups(getActiveOrgId(req));
	}

	@Post('merge')
	@RequireOrgPermission('patient', 'delete')
	@Idempotent()
	async merge(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(mergeRecordsSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/contacts/merge',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.mergeWithDb(db, tenantId, input, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch('bulk-type')
	@RequireOrgPermission('patient', 'update')
	@IdempotencyExempt(
		'Sets absolute contact_type_id on the given ids — repeat calls with the same body converge to the same rows.'
	)
	bulkSetType(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(contactsBulkTypeSchema, body, req);
		return this.contactsService.bulkSetType(getActiveOrgId(req), input);
	}

	@Get(':id')
	@RequireOrgPermission('patient', 'read')
	get(@Req() req: FastifyRequest, @Param('id') id: string) {
		return this.contactsService.get(getActiveOrgId(req), id);
	}

	@Post()
	@RequireOrgPermission('patient', 'create')
	@Idempotent()
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
	@RequireOrgPermission('patient', 'update')
	@Idempotent()
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
			'/v1/contacts/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.updateWithDb(db, id, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete(':id')
	@RequireOrgPermission('patient', 'delete')
	@Idempotent()
	async remove(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const tenantId = getActiveOrgId(req);
		const actor = getActorFromRequest(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'DELETE',
			'/v1/contacts/:id',
			async (db) => ({
				statusCode: 200,
				body: await this.contactsService.softDeleteWithDb(db, tenantId, id, actor)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}
}
