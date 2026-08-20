import type {
	AppointmentRescheduleDraft,
	Contact,
	RecordUpdateSuggestionSkippedReason,
	TransactionDraft
} from '@verimaya/shared';

export type LlmParseContext = {
	message: string;
	/** Hasta-type contacts used as opaque match hints (AGENTS ilke 6 — drafts only). */
	patients: Contact[];
	/**
	 * Optional tenant operational note (G-26). Appended to the core system prompt
	 * as framed non-instructional context; never replaces server output schema rules.
	 */
	tenantPromptNote?: string | null;
	/**
	 * AI-01 — tenant bilgi bankası (hizmetler/fiyatlar/ödeme kuralları…). `tenantPromptNote`
	 * gibi çekirdek prompt'a **ek bağlam** olarak eklenir, yerine geçmez. Bilgi bankası
	 * boşsa null gelir ve prompt'a hiçbir şey eklenmez.
	 */
	knowledge?: string | null;
};

/** Path taken for a single parse call — written to `jobs` ledger (Adım 25). */
export type LlmParsePath =
	| 'heuristic'
	| 'openai_compatible'
	| 'openai_compatible_fallback';

export type LlmUsageLedger = {
	provider: string;
	/** Actual model id from provider response when available; else requested / heuristic label. */
	model: string | null;
	requestedModel: string | null;
	promptTokens: number | null;
	completionTokens: number | null;
	totalTokens: number | null;
	/** Rough USD cost in microdollars (1e-6 USD); null when unknown / heuristic. */
	estimatedCostUsdMicros: number | null;
	path: LlmParsePath;
	error: string | null;
};

export type LlmParseResult = {
	records: TransactionDraft[];
	usage: LlmUsageLedger;
};

export type LlmRescheduleAppointmentHint = {
	appointment_id: string;
	contact_display_name: string;
	starts_at: string;
};

export type LlmRescheduleContext = {
	message: string;
	appointments: LlmRescheduleAppointmentHint[];
	tenantPromptNote?: string | null;
	knowledge?: string | null;
};

export type LlmRescheduleResult = {
	suggestions: AppointmentRescheduleDraft[];
	/**
	 * Why suggestions are empty (Madde 6.2). Always null when suggestions are non-empty.
	 * LLM-only paths that cannot diagnose return null — never invent a reason.
	 */
	skipped_reason: RecordUpdateSuggestionSkippedReason | null;
	usage: LlmUsageLedger;
};

export type MayaAskContext = {
	question: string;
	/** Bilgi bankası bağlamı; boşsa null — o zaman LLM'e hiç gidilmez. */
	knowledge: string | null;
};

export type MayaAskResult = {
	/** Ham cevap; `MAYA_UNKNOWN_TOKEN` ise çağıran taraf "bilmiyorum"a çevirir. */
	answer: string;
	heuristic: boolean;
};

/** Domain-facing LLM adapter — WhatsApp parse goes through this, not raw HTTP. */
export interface LlmClient {
	parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult>;
	/** AI-02: appointment.starts_at reschedule drafts — empty when match or date is ambiguous. */
	suggestAppointmentReschedule(ctx: LlmRescheduleContext): Promise<LlmRescheduleResult>;
	/** Maya soru-cevap. Yalnız bilgi bankasından cevaplar; bilmiyorsa unknown token döner. */
	answerFromKnowledge(ctx: MayaAskContext): Promise<MayaAskResult>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Durable `jobs.job_type` for LLM/heuristic parse audit + TCO (karne 3.2 / 8.5). */
export const LLM_PARSE_JOB_TYPE = 'llm.parse';
