import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	Param,
	Patch,
	Post,
	Put,
	Req,
	Res,
	UseGuards
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
	contactTypeCreateSchema,
	credentialUpsertSchema,
	financeCategoryCreateSchema,
	financeCategoryUpdateSchema,
	trustScoreSettings,
	whatsappAiDisclosureUpdateSchema
} from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import {
	ActiveOrgGuard,
	getActiveOrgId,
	getActorFromRequest,
	getIdempotencyKey
} from '../common/active-org.guard';
import { Idempotent, IdempotencyExempt } from '../common/idempotent.decorator';
import { IdempotencyService } from '../common/idempotency.service';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class SettingsController {
	constructor(
		private readonly settingsService: SettingsService,
		private readonly idempotency: IdempotencyService
	) {}

	@Get('finance-categories')
	@RequireOrgPermission('settings', 'read')
	listFinanceCategories(@Req() req: FastifyRequest) {
		return this.settingsService.listFinanceCategories(getActiveOrgId(req));
	}

	@Post('finance-categories')
	@RequireOrgPermission('settings', 'update')
	@Idempotent()
	async createFinanceCategory(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(financeCategoryCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/settings/finance-categories',
			async (db) => ({
				statusCode: 201,
				body: await this.settingsService.createFinanceCategoryWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Patch('finance-categories/:id')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Sets absolute fields to caller-supplied values (name/kind/sort_order/subcategories, each falling back to the existing value when omitted) — repeat calls converge to the same state.'
	)
	updateFinanceCategory(
		@Req() req: FastifyRequest,
		@Param('id') id: string,
		@Body() body: unknown
	) {
		const input = parseBody(financeCategoryUpdateSchema, body, req);
		return this.settingsService.updateFinanceCategory(getActiveOrgId(req), id, input);
	}

	@Delete('finance-categories/:id')
	@HttpCode(204)
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'DELETE-by-id; retrying after a successful delete 404s (row already gone) rather than silently duplicating — safe, if not seamlessly replayed. Low-stakes settings config, not financial/domain data.'
	)
	async removeFinanceCategory(@Req() req: FastifyRequest, @Param('id') id: string) {
		await this.settingsService.deleteFinanceCategory(getActiveOrgId(req), id);
	}

	@Get('contact-types')
	@RequireOrgPermission('settings', 'read')
	listContactTypes(@Req() req: FastifyRequest) {
		return this.settingsService.listContactTypes(getActiveOrgId(req));
	}

	@Post('contact-types')
	@RequireOrgPermission('settings', 'update')
	@Idempotent()
	async createContactType(
		@Req() req: FastifyRequest,
		@Body() body: unknown,
		@Res({ passthrough: true }) reply: FastifyReply
	) {
		const input = parseBody(contactTypeCreateSchema, body, req);
		const tenantId = getActiveOrgId(req);
		const result = await this.idempotency.run(
			tenantId,
			getIdempotencyKey(req),
			'POST',
			'/v1/settings/contact-types',
			async (db) => ({
				statusCode: 201,
				body: await this.settingsService.createContactTypeWithDb(db, tenantId, input)
			})
		);
		reply.status(result.statusCode);
		return result.body;
	}

	@Delete('contact-types/:id')
	@HttpCode(204)
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'DELETE-by-id; retrying after a successful delete 404s (row already gone) rather than silently duplicating. Low-stakes settings config, not financial/domain data.'
	)
	async removeContactType(@Req() req: FastifyRequest, @Param('id') id: string) {
		await this.settingsService.deleteContactType(getActiveOrgId(req), id);
	}

	@Get('appointment-types')
	@RequireOrgPermission('settings', 'read')
	listAppointmentTypes(@Req() req: FastifyRequest) {
		return this.settingsService.listAppointmentTypes(getActiveOrgId(req));
	}

	@Get('credentials/:provider')
	@RequireOrgPermission('settings', 'read')
	getCredential(@Req() req: FastifyRequest, @Param('provider') provider: string) {
		return this.settingsService.getCredentialStatus(getActiveOrgId(req), provider);
	}

	@Put('credentials/:provider')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'Upsert-by-provider (select-then-update-or-insert); repeat PUTs converge to the same stored ciphertext — PUT semantics.'
	)
	putCredential(
		@Req() req: FastifyRequest,
		@Param('provider') provider: string,
		@Body() body: unknown
	) {
		const input = parseBody(credentialUpsertSchema, body, req);
		return this.settingsService.storeCredential(getActiveOrgId(req), provider, input);
	}

	@Get('trust-score')
	@RequireOrgPermission('settings', 'read')
	getTrustScore(@Req() req: FastifyRequest) {
		return this.settingsService.getTrustScore(getActiveOrgId(req));
	}

	@Put('trust-score')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'True upsert via onConflictDoUpdate (tenant_id, key) in setTenantSetting — repeat PUTs converge to the same stored value.'
	)
	putTrustScore(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(trustScoreSettings, body, req);
		return this.settingsService.saveTrustScore(getActiveOrgId(req), input);
	}

	@Get('ai-disclosure')
	@RequireOrgPermission('settings', 'read')
	getAiDisclosure(@Req() req: FastifyRequest) {
		return this.settingsService.getAiDisclosure(getActiveOrgId(req));
	}

	@Put('ai-disclosure')
	@RequireOrgPermission('settings', 'update')
	@IdempotencyExempt(
		'True upsert via onConflictDoUpdate (tenant_id, key) — repeat PUTs converge to the same stored value. The accompanying audit-log row is append-only by design; a duplicate entry on a genuine retry is harmless.'
	)
	putAiDisclosure(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(whatsappAiDisclosureUpdateSchema, body, req);
		return this.settingsService.saveAiDisclosure(
			getActiveOrgId(req),
			input,
			getActorFromRequest(req)
		);
	}
}
