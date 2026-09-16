import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { VisitReprocessResult } from '@verimaya/shared';
import { ContactVisitSuggestionsService } from '../contacts/contact-visit-suggestions.service';
import type { TenantDb } from '../tenant/tenant-context.service';
import { mesajZamani } from './media-classify.service';
import { vizitCikar } from './vizit-cikar';

/**
 * PARA-01 / VIZIT-01 — **geçmiş mesajlardan vizit önerisi** (tek seferlik tarama).
 *
 * Vizit çıkarımı VIZIT-01 ile geldi; ondan önce alınmış 42 bin satır hiç taranmadı.
 * Kuyruk işlemcisi yalnız yeni gelen mesajı görür ve `archived` satırlara hiç
 * dönmez — oysa "Geliş … Dönüş …" kalıbının çoğu orada duruyor.
 *
 * **Neden `archived` dahil:** kuyruk temizliği (2026-09-15) para taslağı çıkmayan,
 * randevu önerisi doğmayan satırları kuyruktan düşürüyor. Vizit kalıbı taşıyan
 * birçok rezervasyon mesajı tam olarak bu tanıma uyuyor; hariç tutmak taramayı
 * anlamsız kılardı.
 *
 * **Neden tekrar tekrar çalıştırılabilir:** öneri tablosundaki kısmi tekil indeks
 * (tenant + mesaj + kişi) mükerrerini engelliyor, reddedilmiş öneri de kapsamda.
 * İkinci çalıştırma `suggested: 0` döner.
 *
 * **Model çağrısı yok:** `vizitCikar` saf fonksiyon. 42 bin satırı taramak bedava.
 */

/** Tek mesajdan en fazla bu kadar öneri — kuyruk işlemcisiyle aynı sınır. */
const MAX_VISIT_SUGGESTIONS_PER_MESSAGE = 3;
/** `contacts.contact_type_name` denormalize metin; karşılaştırma Türkçe küçük harfle. */
const PATIENT_TYPE_NAME = 'hasta';

type TaramaSatiri = {
	messageId: string;
	body: string;
	chatName: string | null;
	messageAt: Date;
	contactId: string;
};

@Injectable()
export class VisitReprocessService {
	private readonly logger = new Logger(VisitReprocessService.name);

	constructor(private readonly visitSuggestions: ContactVisitSuggestionsService) {}

	/**
	 * Açık işlem içinde koşar (çağıran `IdempotencyService.run` sağlar): tarama ile
	 * yazılan öneriler tek birim olsun, yarım kalmış tarama kayıt bırakmasın.
	 */
	async reprocessWithDb(db: TenantDb, tenantId: string): Promise<VisitReprocessResult> {
		const satirlar = await this.taranacaklar(db);
		const result: VisitReprocessResult = { scanned: 0, suggested: 0 };

		// Aynı mesaj birden çok hastaya bağlı olabilir; çıkarım mesaj başına bir kez.
		const mesajBasi = new Map<string, TaramaSatiri[]>();
		for (const r of satirlar) {
			const list = mesajBasi.get(r.messageId) ?? [];
			if (list.length < MAX_VISIT_SUGGESTIONS_PER_MESSAGE) list.push(r);
			mesajBasi.set(r.messageId, list);
		}

		for (const [messageId, grup] of mesajBasi) {
			result.scanned += 1;
			const ilk = grup[0]!;
			const cikarim = vizitCikar({
				text: ilk.body,
				messageDate: ilk.messageAt,
				chatName: ilk.chatName
			});
			if (!cikarim) continue;

			for (const satir of grup) {
				try {
					const row = await this.visitSuggestions.createFromMessageWithDb(db, tenantId, {
						contactId: satir.contactId,
						inboundMessageId: messageId,
						draft: cikarim.draft,
						sourceText: ilk.body,
						confidence: cikarim.confidence
					});
					if (row) result.suggested += 1;
				} catch (err) {
					// Tek satırın hatası taramayı düşürmesin; sayaç dürüst kalsın.
					this.logger.warn(
						`visit-reprocess message=${messageId} contact=${satir.contactId} failed: ${
							err instanceof Error ? err.message : String(err)
						}`
					);
				}
			}
		}
		return result;
	}

	/**
	 * Gövdesi olan ve **hasta** türünde bir kişiye bağlı bütün mesajlar; durum
	 * süzgeci yok (`archived`, `ignored`, `approved` dahil).
	 *
	 * Mesajın YAZILDIĞI an `created_at` değil WAHA damgasıdır: geçmiş toplu aktarımda
	 * `created_at` hepsinde aynı güne düşer ve yıl yazılmamış tarihler ("26 nisan
	 * gelis") yanlış yıla yuvarlanırdı. Anahtarlar `inbound-mapper.ts`
	 * `extractMessageSentAt` ile aynı; saniye/milisaniye ayrımı TS tarafında.
	 */
	private async taranacaklar(db: TenantDb): Promise<TaramaSatiri[]> {
		const rows = await db.execute(sql`
			select
				msg.id as message_id,
				coalesce(
					nullif(btrim(msg.payload->'payload'->>'body'), ''),
					nullif(btrim(msg.payload->'payload'->>'text'), ''),
					nullif(btrim(msg.payload->'payload'->>'caption'), ''),
					nullif(btrim(msg.payload->>'body'), ''),
					nullif(btrim(msg.payload->>'text'), ''),
					nullif(btrim(msg.payload->>'caption'), '')
				) as body,
				coalesce(
					nullif(btrim(msg.payload->'payload'->>'chatName'), ''),
					nullif(btrim(msg.payload->'payload'->>'chat_name'), ''),
					nullif(btrim(msg.payload->>'chatName'), ''),
					nullif(btrim(msg.payload->>'chat_name'), '')
				) as chat_name,
				msg.created_at,
				coalesce(
					msg.payload->'payload'->>'timestamp',
					msg.payload->'payload'->>'messageTimestamp',
					msg.payload->'payload'->>'t',
					msg.payload->>'timestamp',
					msg.payload->>'messageTimestamp',
					msg.payload->>'t'
				) as sent_ts,
				link.contact_id
			from inbound_messages msg
			join inbound_message_contacts link on link.inbound_message_id = msg.id
			join contacts c on c.id = link.contact_id and c.deleted_at is null
			where lower(btrim(c.contact_type_name)) = ${PATIENT_TYPE_NAME}
				and coalesce(
					nullif(btrim(msg.payload->'payload'->>'body'), ''),
					nullif(btrim(msg.payload->'payload'->>'text'), ''),
					nullif(btrim(msg.payload->'payload'->>'caption'), ''),
					nullif(btrim(msg.payload->>'body'), ''),
					nullif(btrim(msg.payload->>'text'), ''),
					nullif(btrim(msg.payload->>'caption'), '')
				) is not null
			order by msg.created_at asc
		`);

		return [...rows].map((r) => ({
			messageId: String(r.message_id),
			body: String(r.body),
			chatName: (r.chat_name as string | null) ?? null,
			messageAt: mesajZamani(r.sent_ts, r.created_at),
			contactId: String(r.contact_id)
		}));
	}
}
