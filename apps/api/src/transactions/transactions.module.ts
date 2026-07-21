import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { WebhookSubscriptionsModule } from '../webhook-subscriptions/webhook-subscriptions.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
	imports: [AuthModule, CommonModule, WebhookSubscriptionsModule],
	controllers: [TransactionsController],
	providers: [TransactionsService]
})
export class TransactionsModule {}
