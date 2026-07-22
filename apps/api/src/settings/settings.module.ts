import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [SettingsController],
	providers: [SettingsService],
	exports: [SettingsService]
})
export class SettingsModule {}
