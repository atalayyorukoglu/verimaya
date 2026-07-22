import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { WebhookSubscriptionsModule } from '../webhook-subscriptions/webhook-subscriptions.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

@Module({
	imports: [AuthModule, CommonModule, WebhookSubscriptionsModule],
	controllers: [AppointmentsController],
	providers: [AppointmentsService]
})
export class AppointmentsModule {}
