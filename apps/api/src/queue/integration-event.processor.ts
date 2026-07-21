import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { integrationEvents, jobs } from '../db/schema/queue';
import { GhlClientStub } from '../integrations/ghl';
import { TenantContextService } from '../tenant/tenant-context.service';

type IntegrationEventJobPayload = {
	integrationEventId: string;
	provider: string;
};

@Injectable()
export class IntegrationEventProcessor {
	private readonly logger = new Logger(IntegrationEventProcessor.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly ghlClient: GhlClientStub
	) {}

	async process(jobId: string, tenantId: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
			if (!job) {
				throw new Error(`Job ${jobId} not found`);
			}

			const payload = job.payload as IntegrationEventJobPayload;
			const now = new Date();

			await db
				.update(jobs)
				.set({ status: 'processing', startedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));

			if (payload.provider === 'ghl') {
				const [event] = await db
					.select()
					.from(integrationEvents)
					.where(eq(integrationEvents.id, payload.integrationEventId))
					.limit(1);

				if (event) {
					await this.ghlClient.processInboundEvent({
						integrationEventId: event.id,
						tenantId,
						payload: event.payload as Record<string, unknown>
					});
				}

				await db
					.update(integrationEvents)
					.set({ status: 'processed', processedAt: now, updatedAt: now })
					.where(eq(integrationEvents.id, payload.integrationEventId));
			} else {
				this.logger.debug(
					`No handler for provider ${payload.provider}; marking job ${jobId} completed`
				);
			}

			await db
				.update(jobs)
				.set({ status: 'completed', completedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));
		});
	}
}
