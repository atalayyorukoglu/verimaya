import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TenantModule } from '../tenant/tenant.module';
import { CommonModule } from '../common/common.module';
import { OperationAlertsModule } from '../operation-alerts/operation-alerts.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { WhatsappChatsService } from './whatsapp-chats.service';

@Module({
	imports: [AuthModule, CommonModule, OperationAlertsModule, TenantModule],
	controllers: [SettingsController],
	providers: [SettingsService, WhatsappChatsService],
	exports: [SettingsService, WhatsappChatsService]
})
export class SettingsModule {}
