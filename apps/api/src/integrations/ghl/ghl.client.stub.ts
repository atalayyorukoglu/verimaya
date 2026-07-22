import { Injectable, Logger } from '@nestjs/common';
import { GhlSyncService } from './ghl.sync.service';
import type { GhlClient, GhlInboundEvent, GhlProcessResult } from './ghl.types';

@Injectable()
export class GhlClientStub implements GhlClient {
	private readonly logger = new Logger(GhlClientStub.name);

	constructor(private readonly syncService: GhlSyncService) {}

	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const result = this.syncService.parseInboundEvent(event);

		this.logger.log(
			`stub: skip GHL inbound event ${event.integrationEventId} (tenant ${event.tenantId}, kind=${result.kind})`
		);

		return result;
	}
}
