import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { WebhookSubscriptionsController } from './webhook-subscriptions.controller';
import { WebhookSubscriptionsService } from './webhook-subscriptions.service';

@Module({
	imports: [AuthModule, CommonModule],
	controllers: [WebhookSubscriptionsController],
	providers: [WebhookSubscriptionsService],
	exports: [WebhookSubscriptionsService]
})
export class WebhookSubscriptionsModule {}
