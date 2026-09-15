import { Injectable, Logger } from '@nestjs/common';
import type { WhatsappChatPurpose } from '@verimaya/shared';
import { eq } from 'drizzle-orm';
import { inboundMessages } from '../db/schema/inbound-messages';
import { jobs } from '../db/schema/queue';
import { RecordSuggestionsService } from '../record-suggestions/record-suggestions.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { WhatsappChatsService } from '../settings/whatsapp-chats.service';
import { asRecord, extractInboundDisplayFields } from './inbound-mapper';
import { turleriBul } from './mesaj-turu';
import { kisiBilgisiCikar } from './kisi-bilgisi';
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
		private readonly recordSuggestionsService: RecordSuggestionsService,
		private readonly whatsappChats: WhatsappChatsService
	) {}

	async process(jobId: string, tenantId: string): Promise<void> {
		const { inboundMessageId, messageBody, turler, okunmasin } =
			await this.tenantContext.withTenant(tenantId, async ({ db }) => {
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
				// Grubun görevi: `ignore` ise hiç işlenmez, diğerlerinde tür kararına girer.
				const directory = await this.whatsappChats.directoryWithDb(db);
				const purpose = (display.chat_id ? directory.get(display.chat_id)?.purpose : undefined) as
					WhatsappChatPurpose | undefined;

				return {
					inboundMessageId: payload.inboundMessageId,
					messageBody: display.body,
					turler: turleriBul(display.body, purpose ?? 'mixed').turler,
					okunmasin: purpose === 'ignore'
				};
			});

		/*
		 * "Okunmayacak grup": ne para ayrıştırıcısı ne randevu ajanı çalışır; satır
		 * kuyruğa düşmeden `ignored` olur. Eskiden görev yalnız rozeti boşaltıyordu,
		 * ikisi de yine koşuyordu (2026-09-15) — ayarın adı ile yaptığı örtüşmüyordu.
		 * Kişi bağı yine kurulur: kural tabanlı, modele gitmez; Kişi Akışı'nda
		 * "bu grupta da adı geçti" bilgisi kaybolmasın.
		 */
		if (okunmasin) {
			await this.whatsappService.markIgnoredAndLink(tenantId, inboundMessageId);
			await this.completeJob(tenantId, jobId);
			this.logger.debug(
				`inbound_message.process job=${jobId} message=${inboundMessageId} outcome=ignored-by-chat-purpose`
			);
			return;
		}

		const outcome = await this.whatsappService.processInboundMessage(tenantId, inboundMessageId);
		this.logger.debug(
			`inbound_message.process job=${jobId} message=${inboundMessageId} outcome=${outcome}`
		);

		// AI-08: skipped (zaten işlenmiş) satırda randevu ajanı da çalışmaz — mükerrer öneri üretmez.
		//
		// Ayrıca: randevu ajanı yalnız mesajda randevu işareti varsa çağrılır. Önceden
		// HER mesaj için çağrılıyordu; muhasebe grubundaki 4.800 mesaj boşuna LLM
		// çağrısı üretiyor ve ilgisiz öneri riski taşıyordu. Türü hiç anlaşılmayan
		// mesajda yine çağrılır — bilmiyorsak elemek yanlış olur.
		const randevuIhtimali = turler.length === 0 || turler.includes('appointment');
		let oneriSayisi = 0;
		if (outcome !== 'skipped' && randevuIhtimali && messageBody?.trim()) {
			try {
				const r = await this.recordSuggestionsService.parse(tenantId, messageBody);
				oneriSayisi = r.items.length;
			} catch (err) {
				this.logger.warn(
					`inbound_message.process job=${jobId} message=${inboundMessageId} record-suggestions failed: ${
						err instanceof Error ? err.message : String(err)
					}`
				);
			}
		}

		/*
		 * Kuyruk temizliği (2026-09-15, kullanıcı: "bunları tek tek yoksay mı diyeceğim?"):
		 * para taslağı çıkmadı, randevu önerisi doğmadı, insanın yapacağı bir şey yok
		 * (kişi bilgisi / randevu işareti de yok) → satır kuyruğa düşmez, `archived`.
		 * Kişi bağı ve Kişi Akışı etkilenmez; medya-only mesajlar da böyle gider.
		 */
		const insanIsiVar =
			turler.includes('appointment') ||
			turler.includes('contact') ||
			kisiBilgisiCikar(messageBody) !== null;
		if (outcome === 'error' && oneriSayisi === 0 && !insanIsiVar) {
			await this.whatsappService.archiveInboxItem(tenantId, inboundMessageId);
		}

		await this.completeJob(tenantId, jobId);
	}

	private async completeJob(tenantId: string, jobId: string): Promise<void> {
		await this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const now = new Date();
			await db
				.update(jobs)
				.set({ status: 'completed', completedAt: now, updatedAt: now })
				.where(eq(jobs.id, jobId));
		});
	}
}
