import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { inboundMessages } from '../db/schema/inbound-messages';
import { jobs } from '../db/schema/queue';
import { RecordSuggestionsService } from '../record-suggestions/record-suggestions.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { asRecord, extractInboundDisplayFields } from './inbound-mapper';
import { WhatsappService } from './whatsapp.service';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';

type InboundMessageJobPayload = {
	inboundMessageId: string;
};

/**
 * BullMQ handler for `inbound_message.process` — delegates finans parse'ını {@link WhatsappService}'e
 * (same path as POST /whatsapp/inbox/process), sonra AI-08: aynı mesaj gövdesini randevu ajanına
 * ({@link RecordSuggestionsService.parse}) da yollar. Randevu ajanı ayrı try/catch'te — hatası
 * finans yolunu düşürmez, job yine `completed` olur.
 */
@Injectable()
export class InboundMessageProcessor {
	private readonly logger = new Logger(InboundMessageProcessor.name);

	constructor(
		private readonly tenantContext: TenantContextService,
		private readonly whatsappService: WhatsappService,
		private readonly recordSuggestionsService: RecordSuggestionsService
	) {}

	async process(jobId: string, tenantId: string): Promise<void> {
		const { inboundMessageId, messageBody } = await this.tenantContext.withTenant(
			tenantId,
			async ({ db }) => {
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

				const [msg] = await db
					.select({ payload: inboundMessages.payload })
					.from(inboundMessages)
					.where(eq(inboundMessages.id, payload.inboundMessageId))
					.limit(1);
				const display = extractInboundDisplayFields(asRecord(msg?.payload) ?? {});

				return { inboundMessageId: payload.inboundMessageId, messageBody: display.body };
			}
		);

		const outcome = await this.whatsappService.processInboundMessage(tenantId, inboundMessageId);
		this.logger.debug(
			`inbound_message.process job=${jobId} message=${inboundMessageId} outcome=${outcome}`
		);

		// AI-08: skipped (zaten işlenmiş) satırda randevu ajanı da çalışmaz — mükerrer öneri üretmez.
		if (outcome !== 'skipped' && messageBody?.trim()) {
			try {
				await this.recordSuggestionsService.parse(tenantId, messageBody);
			} catch (err) {
				this.logger.warn(
					`inbound_message.process job=${jobId} message=${inboundMessageId} record-suggestions failed: ${
						err instanceof Error ? err.message : String(err)
					}`
				);
			}
		}

		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const now = new Date();
			await db
				.update(jobs)
				.set({ status: 'completed', completedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));
		});
	}
}
