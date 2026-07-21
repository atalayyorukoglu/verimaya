import { Injectable, Logger } from '@nestjs/common';
import type { GhlClient, GhlInboundEvent } from './ghl.types';

@Injectable()
export class GhlClientStub implements GhlClient {
	private readonly logger = new Logger(GhlClientStub.name);

	async processInboundEvent(event: GhlInboundEvent): Promise<void> {
		this.logger.log(
			`stub: skip GHL inbound event ${event.integrationEventId} (tenant ${event.tenantId})`
		);
	}
}
