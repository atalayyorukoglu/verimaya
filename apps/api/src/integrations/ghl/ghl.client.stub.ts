import { Injectable, Logger } from '@nestjs/common';
import { GhlSyncService } from './ghl.sync.service';
import type { GhlClient, GhlInboundEvent, GhlProcessResult } from './ghl.types';

@Injectable()
export class GhlClientStub implements GhlClient {
	private readonly logger = new Logger(GhlClientStub.name);

	constructor(private readonly syncService: GhlSyncService) {}

	async processInboundEvent(event: GhlInboundEvent): Promise<GhlProcessResult> {
		const result = await this.syncService.processInboundEvent(event);

		this.logger.log(
			`GHL inbound event ${event.integrationEventId} (tenant ${event.tenantId}): kind=${result.kind} action=${result.action}`
		);

		return result;
	}
}
