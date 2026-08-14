import { Module } from '@nestjs/common';
import { ActiveOrgGuard } from '../common/active-org.guard';
import { DataSubjectService } from './data-subject.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { PermissionOverridesService } from './permission-overrides.service';
import { SessionGuard } from './session.guard';

@Module({
	controllers: [MeController],
	providers: [
		MeService,
		DataSubjectService,
		PermissionOverridesService,
		SessionGuard,
		ActiveOrgGuard
	],
	exports: [MeService, PermissionOverridesService, SessionGuard]
})
export class AuthModule {}
