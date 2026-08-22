import { z } from 'zod';
import { KNOWLEDGE_SECTIONS } from './knowledge.js';
import { mayaToolNameSchema, mayaToolResultSchema } from './maya-tools.js';

/**
 * Maya — bilgi bankasına dayalı soru-cevap.
 *
 * **Değişmez kural: Maya uydurmaz.** Cevap yalnız tenant'ın kendi bilgi bankasından
 * üretilir. Bilgi bankasında olmayan bir şey sorulursa "bilmiyorum" der ve nereye
 * yazılacağını söyler. Sebep: sağlık turizminde uydurulmuş bir fiyat/kural, cevapsızlıktan
 * çok daha pahalıdır — müşteriye yanlış taahhüt olur.
 *
 * Bu yüzden yanıt `grounded` alanı taşır: cevap gerçekten bilgi bankasından mı çıktı?
 */

export const MAYA_QUESTION_MAX = 500;

export const mayaAskSchema = z
	.object({
		question: z.string().trim().min(1).max(MAYA_QUESTION_MAX)
	})
	.strict();
export type MayaAsk = z.infer<typeof mayaAskSchema>;

export const mayaAnswerSchema = z.object({
	answer: z.string(),
	/** true = cevap bilgi bankasından çıktı; false = "bilmiyorum" cevabı. */
	grounded: z.boolean(),
	/** Cevabın dayandığı bölümler — kullanıcı nereden geldiğini görebilsin. */
	used_sections: z.array(z.enum(KNOWLEDGE_SECTIONS)),
	/** Bilgi bankası hiç doldurulmamış — panelde "önce doldurun" yönlendirmesi için. */
	knowledge_empty: z.boolean(),
	/** LLM yapılandırılmamış; cevap basit metin eşlemesiyle üretildi. */
	heuristic: z.boolean(),
	/**
	 * AI-11a — cevap nereden geldi. `knowledge` bilgi bankası yolu (eski davranış),
	 * `tool` canlı veri aracı, `unknown` cevapsızlık. Kullanıcı hangi yolun
	 * kullanıldığını görebilsin diye yanıtta taşınır.
	 */
	source: z.enum(['knowledge', 'tool', 'unknown']),
	/** Kullanılan araç — `source === 'tool'` iken dolu, aksi hâlde null. */
	tool: mayaToolNameSchema.nullable(),
	/**
	 * Araç sonucu. Rakamların **tek kaynağı** budur ve tamamı Postgres'ten gelir;
	 * `answer` alanı araç yolunda daima boş kalır (cümleyi istemci şablondan kurar).
	 */
	tool_result: mayaToolResultSchema.nullable()
});
export type MayaAnswer = z.infer<typeof mayaAnswerSchema>;

/**
 * Maya'nın sistem prompt'u. Çekirdek kural sunucuda; bilgi bankası VERİ olarak eklenir.
 * "Bilmiyorsan bilmiyorum de" talimatı burada, model tarafında değil.
 */
export function buildMayaSystemPrompt(): string {
	return [
		'You are Maya, an operations assistant for a medical tourism agency.',
		'Answer ONLY from the tenant knowledge base provided below.',
		'If the answer is not in the knowledge base, reply exactly: BILINMIYOR',
		'Never invent prices, packages, payment rules or medical claims.',
		'Never speak on behalf of a patient and never promise anything.',
		'Answer in the same language as the question. Be short: at most 4 sentences.'
	].join(' ');
}

/** Modelin "bilmiyorum" sinyali — cevabın grounded olup olmadığını buradan anlarız. */
export const MAYA_UNKNOWN_TOKEN = 'BILINMIYOR';
