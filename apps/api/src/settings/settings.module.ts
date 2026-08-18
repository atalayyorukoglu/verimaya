import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { OperationAlertsModule } from '../operation-alerts/operation-alerts.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
	imports: [AuthModule, CommonModule, OperationAlertsModule],
	controllers: [SettingsController],
	providers: [SettingsService],
	exports: [SettingsService]
})
export class SettingsModule {}
