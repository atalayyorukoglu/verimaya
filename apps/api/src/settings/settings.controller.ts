import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { credentialUpsertSchema } from '@verimaya/shared';
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

	@Get('contact-types')
	listContactTypes(@Req() req: FastifyRequest) {
		return this.settingsService.listContactTypes(getActiveOrgId(req));
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
}
