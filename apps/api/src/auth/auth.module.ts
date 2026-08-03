import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { SessionGuard } from './session.guard';

@Module({
	controllers: [MeController],
	providers: [MeService, SessionGuard],
	exports: [MeService, SessionGuard]
})
export class AuthModule {}
