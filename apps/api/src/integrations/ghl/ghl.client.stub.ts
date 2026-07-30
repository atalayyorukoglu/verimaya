import { Injectable, Logger } from '@nestjs/common';
import { GhlSyncService } from './ghl.sync.service';
import type {
	GhlClient,
	GhlInboundEvent,
	GhlListContactsParams,
	GhlListContactsResult,
	GhlProcessResult,
	GhlRemoteContact
} from './ghl.types';

/**
 * Fixture / no-network GHL client. Inbound → sync service; pull APIs return empty.
 * Kept for tests and when Marketplace env credentials are absent.
 */
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

	async getContact(_tenantId: string, _contactId: string): Promise<GhlRemoteContact | null> {
		return null;
	}

	async listContacts(
		_tenantId: string,
		_params?: GhlListContactsParams
	): Promise<GhlListContactsResult> {
		return { contacts: [], nextStartAfterId: null };
	}
}
