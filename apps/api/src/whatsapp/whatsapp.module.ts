import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PatientsModule } from '../patients/patients.module';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
	imports: [AuthModule, PatientsModule],
	controllers: [WhatsappController],
	providers: [WhatsappService]
})
export class WhatsappModule {}
