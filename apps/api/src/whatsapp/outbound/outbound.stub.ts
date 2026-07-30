import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { jobs } from '../../db/schema/queue';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { DEFAULT_QUEUE_NAME } from '../../queue/queue.service';
import {
	OUTBOUND_MESSAGE_PORT,
	type OutboundMessagePort,
	type OutboundSendInput,
	type OutboundSendResult,
	WHATSAPP_OUTBOUND_STUB_JOB_TYPE
} from './outbound.port';

/**
 * Does not call WAHA/HTTP — writes a completed `jobs` ledger row for auditability.
 */
@Injectable()
export class StubOutboundMessagePort implements OutboundMessagePort {
	constructor(private readonly tenantContext: TenantContextService) {}

	async send(input: OutboundSendInput): Promise<OutboundSendResult> {
		const jobId = randomUUID();
		const now = new Date();

		await this.tenantContext.withTenant(input.tenantId, async ({ db }) => {
			await db.insert(jobs).values({
				id: jobId,
				tenantId: input.tenantId,
				queue: DEFAULT_QUEUE_NAME,
				jobType: WHATSAPP_OUTBOUND_STUB_JOB_TYPE,
				payload: {
					to: input.to,
					body: input.body,
					origin: input.origin
				},
				status: 'completed',
				attempts: 0,
				startedAt: now,
				completedAt: now
			});
		});

		return {
			jobId,
			bodySent: input.body,
			disclosureApplied: false
		};
	}
}

export { OUTBOUND_MESSAGE_PORT };
