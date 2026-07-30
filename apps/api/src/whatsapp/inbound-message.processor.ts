import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { jobs } from '../db/schema/queue';
import { TenantContextService } from '../tenant/tenant-context.service';
import { WhatsappService } from './whatsapp.service';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';

type InboundMessageJobPayload = {
	inboundMessageId: string;
};

/**
 * BullMQ handler for `inbound_message.process` — delegates parse to {@link WhatsappService}
 * (same path as POST /whatsapp/inbox/process).
 */
@Injectable()
export class InboundMessageProcessor {
	private readonly logger = new Logger(InboundMessageProcessor.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly whatsappService: WhatsappService
	) {}

	async process(jobId: string, tenantId: string): Promise<void> {
		const inboundMessageId = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
			if (!job) {
				throw new Error(`Job ${jobId} not found`);
			}
			if (job.jobType !== INBOUND_MESSAGE_PROCESS_JOB_TYPE) {
				throw new Error(`Job ${jobId} has unexpected type ${job.jobType}`);
			}

			const payload = job.payload as InboundMessageJobPayload;
			if (!payload?.inboundMessageId) {
				throw new Error(`Job ${jobId} missing inboundMessageId`);
			}

			const now = new Date();
			await db
				.update(jobs)
				.set({ status: 'processing', startedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));

			return payload.inboundMessageId;
		});

		const outcome = await this.whatsappService.processInboundMessage(tenantId, inboundMessageId);
		this.logger.debug(
			`inbound_message.process job=${jobId} message=${inboundMessageId} outcome=${outcome}`
		);

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const now = new Date();
			await db
				.update(jobs)
				.set({ status: 'completed', completedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));
		});
	}
}
