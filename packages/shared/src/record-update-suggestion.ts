import { z } from 'zod';
import { cursorPageParams, cursorPageSchema, isoDateTime, uuid } from './common.js';

/**
 * AI-02 — record update approval queue.
 * Contract Madde 6.2: no suggestion is applied without human approval.
 *
 * Kapsam: randevunun tarihi (`starts_at`) ve lojistiği (klinik / otel / transfer).
 * Lojistik 2026-09-15'te eklendi: WhatsApp'tan en sık gelen güncelleme "hastanın
 * oteli değişti" biçiminde ve bunun gideceği hiçbir yer yoktu.
 *
 * Tarih alanı zaman damgası, lojistik alanları metin taşır — ikisi ayrı sütun
 * çiftinde durur (`current_value`/`suggested_value` vs `current_text`/`suggested_text`),
 * tek sütunda string'e çevirmek yerine: tarih karşılaştırması zaman damgası olarak
 * yapılmalı, yoksa "aynı an, farklı yazım" çakışma sanılır.
 */

export const recordUpdateSuggestionFieldSchema = z.enum([
	'starts_at',
	'clinic',
	'hotel',
	'transfer'
]);

/** Metin taşıyan alanlar — `starts_at` dışındakiler. */
export const recordUpdateSuggestionTextFieldSchema = z.enum(['clinic', 'hotel', 'transfer']);
export type RecordUpdateSuggestionTextField = z.infer<
	typeof recordUpdateSuggestionTextFieldSchema
>;
export type RecordUpdateSuggestionField = z.infer<typeof recordUpdateSuggestionFieldSchema>;

export const recordUpdateSuggestionConfidenceSchema = z.enum(['high', 'medium']);
export type RecordUpdateSuggestionConfidence = z.infer<
	typeof recordUpdateSuggestionConfidenceSchema
>;

export const recordUpdateSuggestionStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type RecordUpdateSuggestionStatus = z.infer<typeof recordUpdateSuggestionStatusSchema>;

export const recordUpdateSuggestionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	appointment_id: uuid,
	contact_display_name: z.string().min(1).max(255),
	field: recordUpdateSuggestionFieldSchema,
	/** `starts_at` için dolu, metin alanlarında null. */
	current_value: isoDateTime.nullable(),
	suggested_value: isoDateTime.nullable(),
	/** Metin alanları için. `current_text` null olabilir: otel hiç girilmemiş olabilir. */
	current_text: z.string().max(255).nullable().default(null),
	suggested_text: z.string().max(255).nullable().default(null),
	/**
	 * Önerilen otel/klinik kayıtlı bir kişiye denk geldiyse onun kimliği. Onayda
	 * hem ad hem bağ yazılır; denk gelmediyse yalnız ad yazılır (serbest metin).
	 */
	suggested_contact_id: uuid.nullable().default(null),
	source_text: z.string().min(1).max(4000),
	confidence: recordUpdateSuggestionConfidenceSchema,
	status: recordUpdateSuggestionStatusSchema,
	decided_at: isoDateTime.nullable(),
	decided_by: z.string().max(255).nullable(),
	reject_reason: z.string().max(500).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type RecordUpdateSuggestion = z.infer<typeof recordUpdateSuggestionSchema>;

export const recordUpdateSuggestionParseRequestSchema = z
	.object({
		message: z.string().trim().min(1).max(8000)
	})
	.strict();

export type RecordUpdateSuggestionParseRequest = z.infer<
	typeof recordUpdateSuggestionParseRequestSchema
>;

/**
 * Why parse produced no queue rows (Madde 6.2 — no guessing).
 * Meaningful only when `items` is empty; always `null` when items are present.
 */
export const recordUpdateSuggestionSkippedReasonSchema = z.enum([
	'ambiguous_contact',
	'no_date',
	'no_change',
	/** Lojistik: mesajda otel/klinik/transfer adı okunamadı. */
	'no_value'
]);
export type RecordUpdateSuggestionSkippedReason = z.infer<
	typeof recordUpdateSuggestionSkippedReasonSchema
>;

export const recordUpdateSuggestionParseResponseSchema = z.object({
	items: z.array(recordUpdateSuggestionSchema),
	skipped_reason: recordUpdateSuggestionSkippedReasonSchema.nullable()
});

export type RecordUpdateSuggestionParseResponse = z.infer<
	typeof recordUpdateSuggestionParseResponseSchema
>;

export const recordUpdateSuggestionRejectRequestSchema = z
	.object({
		reason: z.string().trim().max(500).optional()
	})
	.strict();

export type RecordUpdateSuggestionRejectRequest = z.infer<
	typeof recordUpdateSuggestionRejectRequestSchema
>;

export const recordUpdateSuggestionListQuerySchema = cursorPageParams.extend({
	status: recordUpdateSuggestionStatusSchema.default('pending')
});

export type RecordUpdateSuggestionListQuery = z.infer<
	typeof recordUpdateSuggestionListQuerySchema
>;

export const recordUpdateSuggestionListPageSchema = cursorPageSchema(recordUpdateSuggestionSchema);
export type RecordUpdateSuggestionListPage = z.infer<
	typeof recordUpdateSuggestionListPageSchema
>;

/** LLM / heuristic output item before persistence. */
export const appointmentRescheduleDraftSchema = z.object({
	appointment_id: uuid,
	suggested_value: isoDateTime,
	confidence: recordUpdateSuggestionConfidenceSchema,
	reason: z.string().min(1).max(4000)
});

export type AppointmentRescheduleDraft = z.infer<typeof appointmentRescheduleDraftSchema>;

/** Lojistik güncellemesi — LLM/heuristic çıktısı, henüz kaydedilmemiş. */
export const appointmentLogisticsDraftSchema = z.object({
	appointment_id: uuid,
	field: recordUpdateSuggestionTextFieldSchema,
	suggested_text: z.string().min(1).max(255),
	confidence: recordUpdateSuggestionConfidenceSchema,
	reason: z.string().min(1).max(4000)
});

export type AppointmentLogisticsDraft = z.infer<typeof appointmentLogisticsDraftSchema>;
