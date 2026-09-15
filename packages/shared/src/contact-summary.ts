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
	'note'
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
	input_count: z.number().int().nonnegative()
});
export type ContactSummary = z.infer<typeof contactSummarySchema>;
