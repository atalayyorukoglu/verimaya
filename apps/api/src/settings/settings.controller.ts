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
	trustScoreSettings
} from '@verimaya/shared';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
import { parseBody } from '../common/mappers';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(SessionGuard, ActiveOrgGuard)
export class SettingsController {
	constructor(private readonly settingsService: SettingsService) {}

	@Get('finance-categories')
	listFinanceCategories(@Req() req: FastifyRequest) {
		return this.settingsService.listFinanceCategories(getActiveOrgId(req));
	}

	@Post('finance-categories')
	createFinanceCategory(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(financeCategoryCreateSchema, body, req);
		return this.settingsService.createFinanceCategory(getActiveOrgId(req), input);
	}

	@Patch('finance-categories/:id')
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
	async removeFinanceCategory(@Req() req: FastifyRequest, @Param('id') id: string) {
		await this.settingsService.deleteFinanceCategory(getActiveOrgId(req), id);
	}

	@Get('contact-types')
	listContactTypes(@Req() req: FastifyRequest) {
		return this.settingsService.listContactTypes(getActiveOrgId(req));
	}

	@Post('contact-types')
	createContactType(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(contactTypeCreateSchema, body, req);
		return this.settingsService.createContactType(getActiveOrgId(req), input);
	}

	@Delete('contact-types/:id')
	@HttpCode(204)
	async removeContactType(@Req() req: FastifyRequest, @Param('id') id: string) {
		await this.settingsService.deleteContactType(getActiveOrgId(req), id);
	}

	@Get('appointment-types')
	listAppointmentTypes(@Req() req: FastifyRequest) {
		return this.settingsService.listAppointmentTypes(getActiveOrgId(req));
	}

	@Get('credentials/:provider')
	getCredential(@Req() req: FastifyRequest, @Param('provider') provider: string) {
		return this.settingsService.getCredentialStatus(getActiveOrgId(req), provider);
	}

	@Put('credentials/:provider')
	putCredential(
		@Req() req: FastifyRequest,
		@Param('provider') provider: string,
		@Body() body: unknown
	) {
		const input = parseBody(credentialUpsertSchema, body, req);
		return this.settingsService.storeCredential(getActiveOrgId(req), provider, input);
	}

	@Get('trust-score')
	getTrustScore(@Req() req: FastifyRequest) {
		return this.settingsService.getTrustScore(getActiveOrgId(req));
	}

	@Put('trust-score')
	putTrustScore(@Req() req: FastifyRequest, @Body() body: unknown) {
		const input = parseBody(trustScoreSettings, body, req);
		return this.settingsService.saveTrustScore(getActiveOrgId(req), input);
	}
}
