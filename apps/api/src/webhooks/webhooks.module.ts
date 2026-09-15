import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { TenantModule } from '../tenant/tenant.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { WebhooksController } from './webhooks.controller';

@Module({
	imports: [TenantModule, QueueModule, WhatsappModule],
	controllers: [WebhooksController]
})
export class WebhooksModule {}
