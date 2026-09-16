import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { MediaReclassifyResult } from '@verimaya/shared';
import { contactVisits } from '../db/schema/contact-visits';
import { inboundMessageContacts } from '../db/schema/inbound-message-contacts';
import { inboundMessageMedia } from '../db/schema/inbound-message-media';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';
import { evrakSiniflaKaynaklardan } from './evrak-sinifla';

/**
 * EVRAK-01 — eki sınıflandırır ve vizite bağlar.
 *
 * İki ayrı iş, tek serviste: ikisi de aynı girdiye (başlık + ekin tarihi) dayanıyor
 * ve hem ek gelirken hem geçmişi yeniden etiketlerken birlikte koşuyorlar.
 *
 * **Başlık nereden gelir:** Evrak grubunda iki yazım alışkanlığı var — ya ek ile
 * başlık aynı mesajda (caption), ya da önce görsel, hemen ardından ayrı bir mesajla
 * başlık atılıyor. İkincisi için mesaj↔kişi bağındaki `context` kuralının aynısı
 * kullanılır: aynı sohbette, aynı yazarın ±180 sn içindeki en yakın metinli mesajı.
 *
 * **Vizit eşlemesi muhafazakârdır:** ekin tarihi bir vizitin (geliş − 2 gün …
 * dönüş + 2 gün) aralığına düşerse bağlanır. Birden fazla vizit uyarsa BOŞ bırakılır —
 * yanlış vizite bağlanmış evrak, bağlanmamış evraktan daha kötüdür (kontrol listesi
 * yanlış viziti "tamam" işaretler). Kullanıcı Dosyalar sekmesinden elle düzeltir.
 */

/** Vizit penceresinin iki ucuna eklenen pay (gün). */
const VIZIT_PENCERE_GUN = 2;
const GUN_MS = 24 * 60 * 60 * 1000;

type SiniflandirmaGirdisi = {
	mediaId: string;
	messageId: string;
	messageAt: Date;
	filename: string | null;
	caption: string | null;
	docType: string | null;
	docSubtype: string | null;
	visitHint: string | null;
	contactVisitId: string | null;
};

type VizitAdayi = { id: string; arrivalAt: Date | null; departureAt: Date | null };

/** `contact_visits` satırından ekin düşebileceği zaman aralığı. */
export function vizitPenceresi(v: {
	arrivalAt: Date | null;
	departureAt: Date | null;
}): { start: number; end: number } | null {
	const arrival = v.arrivalAt?.getTime() ?? null;
	const departure = v.departureAt?.getTime() ?? null;
	if (arrival === null && departure === null) return null;
	const start = (arrival ?? departure)! - VIZIT_PENCERE_GUN * GUN_MS;
	const end = (departure ?? arrival)! + VIZIT_PENCERE_GUN * GUN_MS;
	return { start, end };
}

/**
 * WAHA damgası (saniye ya da milisaniye) varsa o, yoksa satırın `created_at`'i.
 * `extractMessageSentAt` ile aynı kural; burada SQL'den metin olarak geliyor.
 */
export function mesajZamani(sentTs: unknown, createdAt: unknown): Date {
	const raw = typeof sentTs === 'string' ? Number.parseFloat(sentTs) : NaN;
	if (Number.isFinite(raw) && raw > 0) {
		const d = new Date(raw > 1e12 ? raw : raw * 1000);
		if (!Number.isNaN(d.getTime())) return d;
	}
	return createdAt instanceof Date ? createdAt : new Date(String(createdAt));
}

/** Tek aday varsa onu döner; sıfır ya da birden fazla adayda `null`. */
export function tekVizitSec(at: Date, adaylar: VizitAdayi[]): string | null {
	const t = at.getTime();
	const uyanlar = adaylar.filter((v) => {
		const p = vizitPenceresi(v);
		return p !== null && t >= p.start && t <= p.end;
	});
	return uyanlar.length === 1 ? uyanlar[0]!.id : null;
}

@Injectable()
export class MediaClassifyService {
	private readonly logger = new Logger(MediaClassifyService.name);

	constructor(private readonly tenantContext: TenantContextService) {}

	/**
	 * Verilen ekleri (ya da `null` ise kiracının tümünü) yeniden etiketler.
	 * Açık işlem içinde koşar; çağıran `withTenant` sağlar.
	 */
	async classifyWithDb(db: TenantDb, mediaIds: string[] | null): Promise<MediaReclassifyResult> {
		const girdiler = await this.girdileriTopla(db, mediaIds);
		const result: MediaReclassifyResult = {
			scanned: girdiler.length,
			updated: 0,
			linked_to_visit: 0
		};
		if (girdiler.length === 0) return result;

		const adaylar = await this.vizitAdaylari(
			db,
			girdiler.map((g) => g.messageId)
		);

		for (const g of girdiler) {
			const sinif = evrakSiniflaKaynaklardan(g.caption, g.filename);
			// Elle bağlanmış viziti EZMEYİZ: kullanıcı düzeltmişse yeniden
			// sınıflandırma onu geri almasın (tür değişse bile).
			const vizit = g.contactVisitId ?? tekVizitSec(g.messageAt, adaylar.get(g.messageId) ?? []);

			const degisti =
				sinif.doc_type !== g.docType ||
				sinif.doc_subtype !== g.docSubtype ||
				sinif.visit_hint !== g.visitHint ||
				vizit !== g.contactVisitId;
			if (!degisti) continue;

			await db
				.update(inboundMessageMedia)
				.set({
					docType: sinif.doc_type,
					docSubtype: sinif.doc_subtype,
					visitHint: sinif.visit_hint,
					contactVisitId: vizit
				})
				.where(eq(inboundMessageMedia.id, g.mediaId));
			result.updated++;
			if (vizit !== null && vizit !== g.contactVisitId) result.linked_to_visit++;
		}
		return result;
	}

	/**
	 * `POST /v1/whatsapp/media/reclassify` — kiracının tüm eklerini yeniden etiketler.
	 * Sınıflandırıcı sözlüğü büyüyünce ya da ekler kişilere/vizitlere sonradan
	 * bağlanınca koşturulur. Aynı girdiyle aynı sonucu verir (idempotent).
	 */
	async reclassifyAll(tenantId: string): Promise<MediaReclassifyResult> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => this.classifyWithDb(db, null));
	}

	/**
	 * Sınıflandırma girdisi: ek + mesajın kendi metni + (yoksa) bağlam metni.
	 * `payload` JSON'undan metin çekme kalıbı `message-contacts.service.ts` ile
	 * aynı — WAHA gövdesi bazen `payload.payload`, bazen düz `payload` taşıyor.
	 */
	private async girdileriTopla(
		db: TenantDb,
		mediaIds: string[] | null
	): Promise<SiniflandirmaGirdisi[]> {
		if (mediaIds !== null && mediaIds.length === 0) return [];
		const chatId = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'chatId'), ''), nullif(btrim(${t}.payload->'payload'->>'from'), ''), nullif(btrim(${t}.payload->>'chatId'), ''), nullif(btrim(${t}.payload->>'from'), ''))`
			);
		const author = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'author'), ''), nullif(btrim(${t}.payload->'payload'->>'participant'), ''), nullif(btrim(${t}.payload->'payload'->>'from'), ''))`
			);
		/**
		 * Mesajın YAZILDIĞI an — `created_at` bizim kaydetme anımız; geçmiş toplu
		 * aktarımda hepsi aynı güne düşer ve vizit eşlemesi çöker. `inbound-mapper.ts`
		 * `extractMessageSentAt` ile aynı anahtarlar; saniye/milisaniye ayrımı TS'te.
		 */
		const sentTs = (t: string) =>
			sql.raw(
				`coalesce(${t}.payload->'payload'->>'timestamp', ${t}.payload->'payload'->>'messageTimestamp', ${t}.payload->'payload'->>'t', ${t}.payload->>'timestamp', ${t}.payload->>'messageTimestamp', ${t}.payload->>'t', ${t}.payload->'payload'->'_data'->>'timestamp', ${t}.payload->'payload'->'_data'->>'messageTimestamp', ${t}.payload->'payload'->'_data'->>'t')`
			);
		const body = (t: string) =>
			sql.raw(
				`coalesce(nullif(btrim(${t}.payload->'payload'->>'body'), ''), nullif(btrim(${t}.payload->'payload'->>'caption'), ''), nullif(btrim(${t}.payload->>'body'), ''))`
			);

		const idFilter = mediaIds
			? sql`media.id in (${sql.join(
					mediaIds.map((id) => sql`${id}::uuid`),
					sql`, `
				)})`
			: sql`true`;

		const rows = await db.execute(sql`
			select
				media.id,
				media.inbound_message_id,
				msg.created_at,
				${sentTs('msg')} as sent_ts,
				media.filename,
				media.doc_type,
				media.doc_subtype,
				media.visit_hint,
				media.contact_visit_id,
				coalesce(${body('msg')}, ctx.body) as caption
			from inbound_message_media media
			join inbound_messages msg on msg.id = media.inbound_message_id
			left join lateral (
				select ${body('p')} as body
				from inbound_messages p
				where p.tenant_id = msg.tenant_id
					and ${chatId('p')} = ${chatId('msg')}
					and ${author('p')} = ${author('msg')}
					and p.id <> msg.id
					and abs(extract(epoch from (p.created_at - msg.created_at))) <= 180
					and ${body('p')} is not null
				order by abs(extract(epoch from (p.created_at - msg.created_at))) asc
				limit 1
			) ctx on ${body('msg')} is null
			where ${idFilter}
		`);

		return [...rows].map((r) => ({
			mediaId: String(r.id),
			messageId: String(r.inbound_message_id),
			messageAt: mesajZamani(r.sent_ts, r.created_at),
			filename: (r.filename as string | null) ?? null,
			caption: (r.caption as string | null) ?? null,
			docType: (r.doc_type as string | null) ?? null,
			docSubtype: (r.doc_subtype as string | null) ?? null,
			visitHint: (r.visit_hint as string | null) ?? null,
			contactVisitId: (r.contact_visit_id as string | null) ?? null
		}));
	}

	/** Mesaja bağlı kişilerin silinmemiş vizitleri — eşleme adayları. */
	private async vizitAdaylari(
		db: TenantDb,
		messageIds: string[]
	): Promise<Map<string, VizitAdayi[]>> {
		const out = new Map<string, VizitAdayi[]>();
		const uniq = Array.from(new Set(messageIds));
		if (uniq.length === 0) return out;

		const rows = await db
			.select({
				messageId: inboundMessageContacts.inboundMessageId,
				id: contactVisits.id,
				arrivalAt: contactVisits.arrivalAt,
				departureAt: contactVisits.departureAt
			})
			.from(inboundMessageContacts)
			.innerJoin(
				contactVisits,
				and(
					eq(contactVisits.contactId, inboundMessageContacts.contactId),
					isNull(contactVisits.deletedAt)
				)
			)
			.where(inArray(inboundMessageContacts.inboundMessageId, uniq));

		for (const r of rows) {
			const list = out.get(r.messageId) ?? [];
			// Aynı vizit iki kişi üzerinden iki kez gelebilir; tekille.
			if (!list.some((v) => v.id === r.id)) {
				list.push({ id: r.id, arrivalAt: r.arrivalAt, departureAt: r.departureAt });
			}
			out.set(r.messageId, list);
		}
		return out;
	}
}
