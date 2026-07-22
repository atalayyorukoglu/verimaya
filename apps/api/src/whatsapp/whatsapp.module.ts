import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { LlmModule } from '../integrations/llm';
import { PatientsModule } from '../patients/patients.module';
import { TenantModule } from '../tenant/tenant.module';
import { AiCorrectionsService } from './ai-corrections.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
	imports: [AuthModule, CommonModule, LlmModule, PatientsModule, TenantModule],
	controllers: [WhatsappController],
	providers: [WhatsappService, AiCorrectionsService]
})
export class WhatsappModule {}
