import { Module } from '@nestjs/common';
import { ActiveOrgGuard } from '../common/active-org.guard';
import { DataSubjectService } from './data-subject.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { SessionGuard } from './session.guard';

@Module({
	controllers: [MeController],
	providers: [MeService, DataSubjectService, SessionGuard, ActiveOrgGuard],
	exports: [MeService, SessionGuard]
})
export class AuthModule {}
