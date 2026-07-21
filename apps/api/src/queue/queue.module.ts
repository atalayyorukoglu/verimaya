import { Global, Module } from '@nestjs/common';
import { GhlModule } from '../integrations/ghl/ghl.module';
import { IntegrationEventProcessor } from './integration-event.processor';
import { QueueService } from './queue.service';

@Global()
@Module({
	imports: [GhlModule],
	providers: [IntegrationEventProcessor, QueueService],
	exports: [QueueService]
})
export class QueueModule {}
