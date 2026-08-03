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
	UseGuards
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
	contactTypeCreateSchema,
	credentialUpsertSchema,
	financeCategoryCreateSchema,
	financeCategoryUpdateSchema,
	trustScoreSettings,
	whatsappAiDisclosureUpdateSchema
} from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId, getActorFromRequest } from '../common/active-org.guard';
import { parseBody } from '../common/mappers';
import { OrgPermissionGuard } from '../common/org-permission.guard';
import { RequireOrgPermission } from '../common/require-org-permission.decorator';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(SessionGuard, ActiveOrgGuard, OrgPermissionGuard)
export class SettingsController {
	constructor(private readonly settingsService: SettingsService) {}

	@Get('finance-categories')
	@RequireOrgPermission('settings', 'read')
	listFinanceCategories(@Req() req: FastifyRequest) {
		return this.settingsService.listFinanceCategories(getActiveOrgId(req));
	}

	@Post('finance-categories')
	@RequireOrgPermission('settings', 'update')
	createFinanceCategory(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(financeCategoryCreateSchema, body, req);
		return this.settingsService.createFinanceCategory(getActiveOrgId(req), input);
	}

	@Patch('finance-categories/:id')
	@RequireOrgPermission('settings', 'update')
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
	createContactType(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(contactTypeCreateSchema, body, req);
		return this.settingsService.createContactType(getActiveOrgId(req), input);
	}

	@Delete('contact-types/:id')
	@HttpCode(204)
	@RequireOrgPermission('settings', 'update')
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
	putAiDisclosure(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(whatsappAiDisclosureUpdateSchema, body, req);
		return this.settingsService.saveAiDisclosure(
			getActiveOrgId(req),
			input,
			getActorFromRequest(req)
		);
	}
}
