import { z } from 'zod';
import { isoDate, isoDateTime } from './common.js';
import { recordUpdateSuggestionFieldSchema } from './record-update-suggestion.js';
import { mayaToolNameSchema } from './maya-tools.js';
import { reportPeriodSchema } from './reports.js';
import { aiCorrectionsReportRowSchema } from './ai-correction.js';

/**
 * AI-03 — isabet ölçümü (yalnız ölçüm; otomatik prompt beslemesi kapsam dışı —
 * bkz. docs/2026-08-11-YAPILACAKLAR.md "AI-03 kapsam daraltması (2026-08-22 kararı)").
 *
 * Üç veri kaynağını tek raporda birleştirir: `ai_corrections` (finans taslağı isabeti),
 * `record_update_suggestions` (kayıt güncelleme önerisi kabul oranı), `maya_questions`
 * (Maya'nın cevaplayabildiği/cevaplayamadığı sorular). Hepsi zaten toplanan veri —
 * yeni tablo yok, bu rapor yalnız okur.
 */

/** Panelde gösterilecek cevaplanamayan soru örneği üst sınırı (en yeniler önce). */
export const AI_ACCURACY_UNANSWERED_SAMPLE_LIMIT = 20;

export const aiAccuracyReportParamsSchema = z
	.object({
		from: isoDate.optional(),
		to: isoDate.optional()
	})
	.strict();
export type AiAccuracyReportParams = z.infer<typeof aiAccuracyReportParamsSchema>;

/**
 * "AI ne kadar isabetli?" — onaylanan WhatsApp taslaklarının kaçı hiç dokunulmadan
 * onaylandı. Payda `transactions.source_inbound_message_id` (onay anı = transaction
 * created_at); pay `ai_corrections.corrected_message_count` — ikisi de aynı DB
 * transaction'ında yazıldığı için zaman tabanı tutarlı (approveDraftsWithDb, MONEY-01).
 */
export const aiDraftAccuracySchema = z.object({
	/** Dönemde AI taslağından onaylanan (transactions.source_inbound_message_id dolu) mesaj sayısı. */
	approved_message_count: z.number().int().nonnegative(),
	/** Bunlardan en az bir alanı elle düzeltilenler. */
	corrected_message_count: z.number().int().nonnegative(),
	/** 1 - corrected/approved. Payda 0 ise null (henüz onay yok, oran anlamsız). */
	unchanged_rate: z.number().min(0).max(1).nullable(),
	/** "Nerede yanılıyor?" — alan bazlı düzeltme sıklığı + AI-09 güven kırılımı. */
	by_field: z.array(aiCorrectionsReportRowSchema)
});
export type AiDraftAccuracy = z.infer<typeof aiDraftAccuracySchema>;

export const aiSuggestionFieldAccuracyRowSchema = z.object({
	field: recordUpdateSuggestionFieldSchema,
	approved: z.number().int().nonnegative(),
	rejected: z.number().int().nonnegative()
});
export type AiSuggestionFieldAccuracyRow = z.infer<typeof aiSuggestionFieldAccuracyRowSchema>;

export const aiSuggestionRejectReasonRowSchema = z.object({
	/** Serbest metin (kullanıcı yazdı); `null` = gerekçesiz red. */
	reason: z.string().nullable(),
	count: z.number().int().nonnegative()
});
export type AiSuggestionRejectReasonRow = z.infer<typeof aiSuggestionRejectReasonRowSchema>;

/**
 * "Nerede yanılıyor?" (2/2) — `record_update_suggestions` kabul oranı. `pending`
 * kararsız olduğundan `acceptance_rate` paydasına girmez (yalnız approved+rejected).
 */
export const aiSuggestionsAccuracySchema = z.object({
	total: z.number().int().nonnegative(),
	approved: z.number().int().nonnegative(),
	rejected: z.number().int().nonnegative(),
	pending: z.number().int().nonnegative(),
	acceptance_rate: z.number().min(0).max(1).nullable(),
	by_field: z.array(aiSuggestionFieldAccuracyRowSchema),
	/** En sık red gerekçeleri, sıklığa göre azalan (ilk 10). */
	reject_reasons: z.array(aiSuggestionRejectReasonRowSchema)
});
export type AiSuggestionsAccuracy = z.infer<typeof aiSuggestionsAccuracySchema>;

export const aiMayaSourceCountSchema = z.object({
	source: z.enum(['knowledge', 'tool', 'unknown']),
	count: z.number().int().nonnegative()
});
export type AiMayaSourceCount = z.infer<typeof aiMayaSourceCountSchema>;

export const aiMayaToolCountSchema = z.object({
	tool: mayaToolNameSchema,
	count: z.number().int().nonnegative()
});
export type AiMayaToolCount = z.infer<typeof aiMayaToolCountSchema>;

/** PII yok — `question_masked` zaten maskelenmiş metin (bkz. mayaQuestions şeması). */
export const aiMayaUnansweredSampleSchema = z.object({
	question_masked: z.string(),
	created_at: isoDateTime
});
export type AiMayaUnansweredSample = z.infer<typeof aiMayaUnansweredSampleSchema>;

/**
 * "Maya neyi bilmiyor?" — cevaplanamayan soru oranı + insan kapılı yönlendirme:
 * `unanswered_samples` panelde "bilgi bankana şunu ekle" olarak gösterilir
 * (G-26 `settings/ai` AI prompt notu ya da `settings/knowledge` bilgi bankası).
 * Otomatik besleme yok — tenant kendi elleriyle ekler (AI-03 kapsam daraltması).
 */
export const aiMayaAccuracySchema = z.object({
	total: z.number().int().nonnegative(),
	answered: z.number().int().nonnegative(),
	unanswered: z.number().int().nonnegative(),
	answer_rate: z.number().min(0).max(1).nullable(),
	by_source: z.array(aiMayaSourceCountSchema),
	by_tool: z.array(aiMayaToolCountSchema),
	unanswered_samples: z.array(aiMayaUnansweredSampleSchema)
});
export type AiMayaAccuracy = z.infer<typeof aiMayaAccuracySchema>;

export const aiAccuracyReportSchema = z.object({
	period: reportPeriodSchema,
	drafts: aiDraftAccuracySchema,
	suggestions: aiSuggestionsAccuracySchema,
	maya: aiMayaAccuracySchema
});
export type AiAccuracyReport = z.infer<typeof aiAccuracyReportSchema>;
