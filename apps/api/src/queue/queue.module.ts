import { Global, Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { IntegrationEventProcessor } from './integration-event.processor';
import { OutboxProcessor } from './outbox.processor';
import { QueueService } from './queue.service';

@Global()
@Module({
	imports: [GhlModule, CommonModule],
	providers: [IntegrationEventProcessor, OutboxProcessor, QueueService],
	exports: [QueueService]
})
export class QueueModule {}
