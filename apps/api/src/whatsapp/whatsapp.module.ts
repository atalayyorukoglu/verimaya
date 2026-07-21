import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { TenantModule } from '../tenant/tenant.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
	imports: [AuthModule, PatientsModule, TenantModule],
	controllers: [WhatsappController],
	providers: [WhatsappService]
})
export class WhatsappModule {}
