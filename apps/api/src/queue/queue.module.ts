import { Global, Module } from '@nestjs/common';
import { AdMetricsModule } from '../ad-metrics/ad-metrics.module';
import { CommonModule } from '../common/common.module';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { IntegrationEventProcessor } from './integration-event.processor';
import { OutboxProcessor } from './outbox.processor';
import { QueueService } from './queue.service';

@Global()
@Module({
	imports: [GhlModule, AdMetricsModule, CommonModule],
	providers: [IntegrationEventProcessor, OutboxProcessor, QueueService],
	exports: [QueueService]
})
export class QueueModule {}
