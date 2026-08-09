import { Global, Module, forwardRef } from '@nestjs/common';
import { AdMetricsModule } from '../ad-metrics/ad-metrics.module';
import { CommonModule } from '../common/common.module';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { StorageModule } from '../storage/storage.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { IntegrationEventProcessor } from './integration-event.processor';
import { OutboxAdminService } from './outbox-admin.service';
import { OutboxProcessor } from './outbox.processor';
import { QueueService } from './queue.service';

@Global()
@Module({
	imports: [
		GhlModule,
		AdMetricsModule,
		CommonModule,
		StorageModule,
		forwardRef(() => WhatsappModule)
	],
	providers: [IntegrationEventProcessor, OutboxProcessor, OutboxAdminService, QueueService],
	exports: [QueueService, OutboxAdminService]
})
export class QueueModule {}
