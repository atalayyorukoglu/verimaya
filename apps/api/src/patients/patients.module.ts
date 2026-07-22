import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { WebhookSubscriptionsModule } from '../webhook-subscriptions/webhook-subscriptions.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Module({
	imports: [AuthModule, CommonModule, WebhookSubscriptionsModule],
	controllers: [PatientsController],
	providers: [PatientsService],
	exports: [PatientsService]
})
export class PatientsModule {}
