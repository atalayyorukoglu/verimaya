import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * KISI-01 adım 3 — kişinin akışından model tarafından yazılan özet.
 *
 * Her cümle dayandığı kayıtları taşır (`sources`): "neden böyle dedin" sorusunun
 * cevabı kaynak mesaj/randevu/işlemdir. Özet TÜRETİLMİŞ veridir: elle düzenlenmez,
 * kaynak veri değişince yeniden yazılır (`stale`). Çalışan notları ayrı kalır.
 */
export const contactSummarySourceKindSchema = z.enum([
	'whatsapp',
	'appointment',
	'transaction',
	'note',
	/** VIZIT-01 — kişi viziti (konsültasyon / 1 / 2 / RPT). */
	'visit'
]);
export type ContactSummarySourceKind = z.infer<typeof contactSummarySourceKindSchema>;

export const contactSummarySourceSchema = z.object({
	kind: contactSummarySourceKindSchema,
	id: uuid,
	at: isoDateTime.nullable(),
	/** Kaynağın kısa alıntısı — arayüzde üstüne gelince görünür. */
	quote: z.string().max(280).nullable()
});
export type ContactSummarySource = z.infer<typeof contactSummarySourceSchema>;

export const contactSummarySentenceSchema = z.object({
	text: z.string().max(600),
	sources: z.array(contactSummarySourceSchema)
});
export type ContactSummarySentence = z.infer<typeof contactSummarySentenceSchema>;

/**
 * KISI-02 — hasta akışı kontrol listesinde karşılığı bulunamayan madde.
 *
 * `item_id` tenant şablonundaki maddedir; `label` ve `warning` şablondan kopyalanır
 * (kart, ayarları okuma izni olmadan da uyarıyı gösterebilsin), `note` modelin kısa
 * gerekçesidir. Yalnız kişi türü Hasta olan kayıtlarda dolar.
 */
export const contactSummaryMissingSchema = z.object({
	item_id: z.string().max(64),
	label: z.string().max(200),
	warning: z.string().max(200),
	note: z.string().max(300),
	/**
	 * EVRAK-01 — eksiğin hangi vizitte olduğu ("2. vizit · 13 Eyl 2026 → 19 Eyl 2026").
	 * Hesaplanan eksiklerde dolu, modelin kendi bildirdiklerinde null (model vizit
	 * ayırt edemez). Kart bu alana göre gruplar.
	 */
	visit_label: z.string().max(200).nullable().default(null)
});
export type ContactSummaryMissing = z.infer<typeof contactSummaryMissingSchema>;

export const contactSummarySchema = z.object({
	contact_id: uuid,
	sentences: z.array(contactSummarySentenceSchema),
	/** Özet yokken (hiç kayıt yok) null. */
	generated_at: isoDateTime.nullable(),
	/** Kaynak veri özetten sonra değişti; yenilenebilir. */
	stale: z.boolean(),
	/** LLM anahtarı yokken kural tabanlı üretildi. */
	heuristic: z.boolean(),
	model: z.string().max(120).nullable(),
	/** Özete giren kayıt sayısı (mesaj + randevu + işlem + not). */
	input_count: z.number().int().nonnegative(),
	/** Hasta akışı şablonunda eksik kalan maddeler; Hasta olmayan kişide hep boş. */
	missing: z.array(contactSummaryMissingSchema)
});
export type ContactSummary = z.infer<typeof contactSummarySchema>;
