import { Injectable, Logger } from '@nestjs/common';
import type { WhatsappChatPurpose } from '@verimaya/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { ContactVisitSuggestionsService } from '../contacts/contact-visit-suggestions.service';
import { contacts } from '../db/schema/contacts';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessages } from '../db/schema/inbound-messages';
import { jobs } from '../db/schema/queue';
import { RecordSuggestionsService } from '../record-suggestions/record-suggestions.service';
import { TenantContextService } from '../tenant/tenant-context.service';
import { WhatsappChatsService } from '../settings/whatsapp-chats.service';
import { asRecord, extractInboundDisplayFields } from './inbound-mapper';
import { sohbetMi, turleriBul } from './mesaj-turu';
import { kisiBilgisiCikar } from './kisi-bilgisi';
import { WhatsappService } from './whatsapp.service';
import { INBOUND_MESSAGE_PROCESS_JOB_TYPE } from '../queue/queue.constants';
import { vizitCikar } from './vizit-cikar';
import { randevuIpucuCikar } from './randevu-ipucu';
import { evrakSinifla } from './evrak-sinifla';

type InboundMessageJobPayload = {
	inboundMessageId: string;
};

/** `contacts.contact_type_name` denormalize metin; karşılaştırma Türkçe küçük harfle. */
const PATIENT_TYPE_NAME = 'hasta';
/** Tek mesajdan en fazla bu kadar vizit önerisi — gerisi kuyruğu boğar. */
const MAX_VISIT_SUGGESTIONS_PER_MESSAGE = 3;

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
		private readonly whatsappChats: WhatsappChatsService,
		private readonly visitSuggestions: ContactVisitSuggestionsService
	) {}

	async process(jobId: string, tenantId: string): Promise<void> {
		const {
			inboundMessageId,
			messageBody,
			turler,
			turlerMetin,
			okunmasin,
			operasyonGrubu,
			chatName,
			messageDate
		} = await this.tenantContext.withTenant(tenantId, async ({ db }) => {
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
				.select({ payload: inboundMessages.payload, createdAt: inboundMessages.createdAt })
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
				/*
				 * Aynı metin, grubun varsayılanı UYGULANMADAN. Operasyon grubunda
				 * işaretsiz her mesaj `contact` sayılıyor; arşivleme kararı bu
				 * varsayılana bakarsa "Tamamdır 🙏🏻" da "insan işi" görünür.
				 */
				turlerMetin: turleriBul(display.body, 'mixed').turler,
				okunmasin: purpose === 'ignore',
				operasyonGrubu: purpose === 'operations',
				chatName:
					(display.chat_id ? directory.get(display.chat_id)?.name : null) ??
					display.chat_name ??
					null,
				messageDate: msg?.createdAt ?? null
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
		 * VIZIT-01 — aynı gövdeden vizit çıkarımı. Saf fonksiyon, LLM çağrısı yok:
		 * "Geliş … Dönüş … randevusunun oluşturulmasını rica ederim" kalıbı ve
		 * "2.ci vizit / rpt / konsültasyon" ipuçları. Çıkan şey ÖNERİDİR — kullanıcı
		 * kuyrukta onaylayınca vizit olur (AGENTS ilke 6).
		 *
		 * Ayrı try/catch: vizit çıkarımının hatası ne para yolunu ne randevu ajanını
		 * düşürür, job yine `completed` olur.
		 */
		let vizitOnerisi = 0;
		if (outcome !== 'skipped' && messageBody?.trim()) {
			try {
				vizitOnerisi = await this.vizitOnerisiYaz(
					tenantId,
					inboundMessageId,
					messageBody,
					chatName,
					messageDate
				);
			} catch (err) {
				this.logger.warn(
					`inbound_message.process job=${jobId} message=${inboundMessageId} visit-suggestion failed: ${
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
		if (outcome === 'error' && oneriSayisi === 0 && vizitOnerisi === 0 && !insanIsiVar) {
			await this.whatsappService.archiveInboxItem(tenantId, inboundMessageId);
		} else if (
			outcome !== 'skipped' &&
			oneriSayisi === 0 &&
			vizitOnerisi === 0 &&
			this.sadeceSohbet(messageBody, turlerMetin, operasyonGrubu, chatName, messageDate)
		) {
			await this.whatsappService.archiveInboxItem(tenantId, inboundMessageId);
		}

		await this.completeJob(tenantId, jobId);
	}

	/**
	 * KUCUK-01 — "Rezervasyon sohbetleri kuyruğa düşmesin".
	 *
	 * Amacı **Operasyon** olan gruplarda işaretsiz her mesaj `contact` sayılıyor
	 * (grubun varsayılanı), bu yüzden "Tamamdır 🙏🏻", "Teşekkür ederim",
	 * "Bakıyorum hemen", "////" satırları da kuyrukta kart açıyordu. Böyle bir
	 * satırda insanın yapacağı hiçbir iş yok: doğrudan arşive.
	 *
	 * Kapılar (hepsi kapalı olmalı): metinde para/randevu/kişi işareti yok,
	 * kişi bilgisi (mail/telefon) yok, evrak sınıfı tanınmıyor, randevu ipucu
	 * üretilmiyor, vizit çıkarımı yok. Vizit önerisi ya da randevu ipucu üreten
	 * mesaj KUYRUKTA KALIR — "Zaid Waldu … Geliş … Dönüş …" arşive gitmez.
	 */
	private sadeceSohbet(
		messageBody: string | null,
		turlerMetin: string[],
		operasyonGrubu: boolean,
		chatName: string | null,
		messageDate: Date | null
	): boolean {
		if (!operasyonGrubu) return false;
		if (!messageBody?.trim()) return false;
		if (turlerMetin.length > 0) return false;
		if (!sohbetMi(messageBody)) return false;
		if (kisiBilgisiCikar(messageBody) !== null) return false;
		if (evrakSinifla(messageBody).doc_type !== 'other') return false;
		if (vizitCikar({ text: messageBody, messageDate, chatName })) return false;
		if (randevuIpucuCikar({ text: messageBody, messageDate, chatName })) return false;
		return true;
	}

	/**
	 * VIZIT-01 — mesajdan vizit taslağı çıkarıp bağlı HASTA kişiler için öneri açar.
	 *
	 * Yalnız hasta türündeki kişiler: aynı mesaja otel/klinik kişisi de bağlanmış
	 * olabiliyor, onlara vizit önerilmez. İki hasta birden geçiyorsa ikisine de
	 * açılır ("Beverly Ann Cherry ve Lacey Peters RPT" gerçek bir mesaj) ama en
	 * fazla üç kişiye — daha fazlası kuyruk değil gürültü olur.
	 */
	private async vizitOnerisiYaz(
		tenantId: string,
		inboundMessageId: string,
		messageBody: string,
		chatName: string | null,
		messageDate: Date | null
	): Promise<number> {
		const cikarim = vizitCikar({ text: messageBody, messageDate, chatName });
		if (!cikarim) return 0;

		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const bagli = await db
				.select({ contactId: contacts.id, typeName: contacts.contactTypeName })
				.from(inboundMessageContacts)
				.innerJoin(contacts, eq(inboundMessageContacts.contactId, contacts.id))
				.where(
					and(
						eq(inboundMessageContacts.inboundMessageId, inboundMessageId),
						isNull(contacts.deletedAt)
					)
				);

			const hastalar = bagli
				.filter((r) => r.typeName.trim().toLocaleLowerCase('tr') === PATIENT_TYPE_NAME)
				.slice(0, MAX_VISIT_SUGGESTIONS_PER_MESSAGE);

			let yazilan = 0;
			for (const hasta of hastalar) {
				const row = await this.visitSuggestions.createFromMessageWithDb(db, tenantId, {
					contactId: hasta.contactId,
					inboundMessageId,
					draft: cikarim.draft,
					sourceText: messageBody,
					confidence: cikarim.confidence
				});
				if (row) yazilan += 1;
			}
			return yazilan;
		});
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
