import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * VIZIT-01 — kişi başına **vizit** kaydı (`docs/2026-09-16-HASTA-AKISI.md` § 6.2).
 *
 * Bugüne kadar her şey kişiye düz bağlıydı; oysa hasta akışı vizit başına ilerliyor
 * (konsültasyon → 1. vizit → 2. vizit → RPT). Evrak seti, tahsilat ve gider vizite
 * bağlanmadan "2. vizit ödemesi alınmadı" gibi uyarılar çıkmıyor.
 *
 * Vizit **kesin kayıttır**: WhatsApp'tan çıkarılan hâli doğrudan buraya yazılmaz,
 * önce `contact_visit_suggestions` kuyruğuna düşer, insan onaylayınca vizit olur
 * (AGENTS ilke 6 — insan onayı olmadan kesin kayıt yok).
 */

export const contactVisitTypeSchema = z.enum([
	'consultation',
	'visit_1',
	'visit_2',
	'visit_3',
	'rpt',
	'other'
]);
export type ContactVisitType = z.infer<typeof contactVisitTypeSchema>;

/** Türkçe etiketler — arayüz ve özet aynı sözcükleri kullansın. */
export const contactVisitTypeLabels: Record<ContactVisitType, string> = {
	consultation: 'Konsültasyon',
	visit_1: '1. vizit',
	visit_2: '2. vizit',
	visit_3: '3. vizit',
	rpt: 'RPT',
	other: 'Diğer'
};

export const contactVisitStatusSchema = z.enum([
	'planned',
	'in_progress',
	'completed',
	'cancelled'
]);
export type ContactVisitStatus = z.infer<typeof contactVisitStatusSchema>;

export const contactVisitStatusLabels: Record<ContactVisitStatus, string> = {
	planned: 'Planlandı',
	in_progress: 'Devam ediyor',
	completed: 'Tamamlandı',
	cancelled: 'İptal'
};

/**
 * Oteli kim karşılıyor. RPT kuralı (§ 9) bu alana dayanır: RPT'de otel/transfer
 * verilmez; `company` yazılmışsa özet istisna notu arar.
 */
export const contactVisitHotelCoveredBySchema = z.enum(['company', 'patient', 'unknown']);
export type ContactVisitHotelCoveredBy = z.infer<typeof contactVisitHotelCoveredBySchema>;

export const contactVisitHotelCoveredByLabels: Record<ContactVisitHotelCoveredBy, string> = {
	company: 'Firma',
	patient: 'Hasta',
	unknown: 'Belirsiz'
};

const shortText = z.string().trim().max(255);
const longText = z.string().trim().max(4000);

export const contactVisitSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	visit_type: contactVisitTypeSchema,
	/** Kaçıncı vizit (1, 2, 3…). RPT ve konsültasyonda genelde boştur. */
	sequence: z.number().int().min(0).max(99).nullable(),
	arrival_at: isoDateTime.nullable(),
	/**
	 * Mesajda yalnız gün yazıyorsa ("26 nisan gelis") saat bilinmez. Bayrak olmasa
	 * `arrival_at` gece yarısını uçuş saati gibi gösterirdi — arayüz bu bayrağa
	 * bakıp saati gizler.
	 */
	arrival_time_known: z.boolean(),
	departure_at: isoDateTime.nullable(),
	departure_time_known: z.boolean(),
	arrival_flight: shortText.nullable(),
	departure_flight: shortText.nullable(),
	hotel: shortText.nullable(),
	hotel_covered_by: contactVisitHotelCoveredBySchema,
	transfer_provider: shortText.nullable(),
	clinic: shortText.nullable(),
	doctor: shortText.nullable(),
	treatment_plan: longText.nullable(),
	status: contactVisitStatusSchema,
	notes: longText.nullable(),
	/** Vizit bir WhatsApp mesajından önerildiyse kaynağı. */
	source_inbound_message_id: uuid.nullable(),
	created_by: z.string().max(255).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});
export type ContactVisit = z.infer<typeof contactVisitSchema>;

export const contactVisitCreateSchema = z
	.object({
		visit_type: contactVisitTypeSchema,
		sequence: z.number().int().min(0).max(99).nullable().optional(),
		arrival_at: isoDateTime.nullable().optional(),
		arrival_time_known: z.boolean().optional(),
		departure_at: isoDateTime.nullable().optional(),
		departure_time_known: z.boolean().optional(),
		arrival_flight: shortText.nullable().optional(),
		departure_flight: shortText.nullable().optional(),
		hotel: shortText.nullable().optional(),
		hotel_covered_by: contactVisitHotelCoveredBySchema.optional(),
		transfer_provider: shortText.nullable().optional(),
		clinic: shortText.nullable().optional(),
		doctor: shortText.nullable().optional(),
		treatment_plan: longText.nullable().optional(),
		status: contactVisitStatusSchema.optional(),
		notes: longText.nullable().optional(),
		source_inbound_message_id: uuid.nullable().optional()
	})
	.strict();
export type ContactVisitCreate = z.infer<typeof contactVisitCreateSchema>;

/** PATCH — verilmeyen alan dokunulmaz; `null` alanı boşaltır. */
export const contactVisitUpdateSchema = contactVisitCreateSchema
	.partial()
	.omit({ source_inbound_message_id: true })
	.strict();
export type ContactVisitUpdate = z.infer<typeof contactVisitUpdateSchema>;

export const contactVisitListSchema = z.object({ items: z.array(contactVisitSchema) });
export type ContactVisitList = z.infer<typeof contactVisitListSchema>;

/* ------------------------------------------------------------------ öneri */

/**
 * Saf çıkarımın (`vizit-cikar.ts`) ürettiği taslak. Kaydedilmiş bir vizit DEĞİL:
 * kuyruğa düşer, kullanıcı alanları düzenleyip onaylayınca vizit olur.
 */
export const contactVisitDraftSchema = z.object({
	visit_type: contactVisitTypeSchema,
	sequence: z.number().int().min(0).max(99).nullable(),
	arrival_at: isoDateTime.nullable(),
	arrival_time_known: z.boolean(),
	departure_at: isoDateTime.nullable(),
	departure_time_known: z.boolean(),
	hotel: shortText.nullable(),
	clinic: shortText.nullable(),
	doctor: shortText.nullable(),
	treatment_plan: longText.nullable()
});
export type ContactVisitDraft = z.infer<typeof contactVisitDraftSchema>;

export const contactVisitSuggestionStatusSchema = z.enum(['pending', 'approved', 'rejected']);
export type ContactVisitSuggestionStatus = z.infer<typeof contactVisitSuggestionStatusSchema>;

export const contactVisitSuggestionConfidenceSchema = z.enum(['high', 'medium']);
export type ContactVisitSuggestionConfidence = z.infer<
	typeof contactVisitSuggestionConfidenceSchema
>;

export const contactVisitSuggestionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	contact_display_name: z.string().max(255),
	inbound_message_id: uuid.nullable(),
	draft: contactVisitDraftSchema,
	source_text: z.string().max(4000),
	confidence: contactVisitSuggestionConfidenceSchema,
	status: contactVisitSuggestionStatusSchema,
	/** Onaylandıysa doğan vizit. */
	created_visit_id: uuid.nullable(),
	decided_at: isoDateTime.nullable(),
	decided_by: z.string().max(255).nullable(),
	reject_reason: z.string().max(500).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});
export type ContactVisitSuggestion = z.infer<typeof contactVisitSuggestionSchema>;

/**
 * Onay gövdesi. `visit` verilirse kullanıcının kuyrukta düzelttiği hâli yazılır;
 * verilmezse taslak olduğu gibi kaydedilir.
 */
export const contactVisitSuggestionApproveSchema = z
	.object({ visit: contactVisitCreateSchema.optional() })
	.strict();
export type ContactVisitSuggestionApprove = z.infer<typeof contactVisitSuggestionApproveSchema>;

export const contactVisitSuggestionRejectSchema = z
	.object({ reason: z.string().trim().max(500).optional() })
	.strict();
export type ContactVisitSuggestionReject = z.infer<typeof contactVisitSuggestionRejectSchema>;

export const contactVisitSuggestionListQuerySchema = z.object({
	status: contactVisitSuggestionStatusSchema.default('pending'),
	limit: z.coerce.number().int().min(1).max(100).default(50)
});
export type ContactVisitSuggestionListQuery = z.infer<typeof contactVisitSuggestionListQuerySchema>;

export const contactVisitSuggestionListSchema = z.object({
	items: z.array(contactVisitSuggestionSchema)
});
export type ContactVisitSuggestionList = z.infer<typeof contactVisitSuggestionListSchema>;

/**
 * Taslaktan vizit gövdesi. Tek yerde durur ki kuyruk kartı ile sunucu onayı
 * aynı alanları aynı biçimde doldursun.
 */
export function contactVisitCreateFromDraft(draft: ContactVisitDraft): ContactVisitCreate {
	return {
		visit_type: draft.visit_type,
		sequence: draft.sequence,
		arrival_at: draft.arrival_at,
		arrival_time_known: draft.arrival_time_known,
		departure_at: draft.departure_at,
		departure_time_known: draft.departure_time_known,
		hotel: draft.hotel,
		clinic: draft.clinic,
		doctor: draft.doctor,
		treatment_plan: draft.treatment_plan,
		status: 'planned'
	};
}

/** "2. vizit · 13 Eyl 2026 → 19 Eyl 2026" — özet ve liste aynı tek satırı kullanır. */
export function contactVisitDateRangeLabel(visit: {
	arrival_at: string | null;
	arrival_time_known: boolean;
	departure_at: string | null;
	departure_time_known: boolean;
}): string {
	const fmt = (iso: string | null, timeKnown: boolean): string | null => {
		if (!iso) return null;
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return null;
		const day = new Intl.DateTimeFormat('tr-TR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(d);
		if (!timeKnown) return day;
		const time = new Intl.DateTimeFormat('tr-TR', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'UTC'
		}).format(d);
		return `${day} ${time}`;
	};
	const a = fmt(visit.arrival_at, visit.arrival_time_known);
	const b = fmt(visit.departure_at, visit.departure_time_known);
	if (a && b) return `${a} → ${b}`;
	return a ?? b ?? '';
}
