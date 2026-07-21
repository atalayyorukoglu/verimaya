import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SessionGuard } from '../auth/session.guard';
import { ActiveOrgGuard, getActiveOrgId } from '../common/active-org.guard';
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
}
