import type {
	AppointmentLogisticsDraft,
	AppointmentRescheduleDraft,
	Contact,
	MayaContactRef,
	MayaToolCall,
	PatientFlowChecklistItem,
	RecordUpdateSuggestionSkippedReason,
	TransactionDraft
} from '@verimaya/shared';
import type { TenantKategori } from '../../whatsapp/kategori';

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
	/**
	 * Mesajın geldiği gün (YYYY-MM-DD, tenant saat dilimi). Mesajda tarih yazmıyorsa
	 * taslağın `occurred_on` varsayılanı budur — analizin yapıldığı gün değil.
	 * Yapıştırılan serbest metinde bilinmiyor; o zaman bugüne düşülür.
	 */
	messageDate?: string | null;
	/**
	 * Kiracının finans kategorileri (`{kind, name, subcategories[]}`). Prompt'a
	 * **veri** olarak eklenir ve dönen `category`/`subcategory` buna karşı
	 * doğrulanır. Boş/verilmemişse kategori alanı eskisi gibi serbest kalır.
	 */
	categories?: TenantKategori[];
};

/** Path taken for a single parse call — written to `jobs` ledger (Adım 25). */
export type LlmParsePath = 'heuristic' | 'openai_compatible' | 'openai_compatible_fallback';

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

/**
 * Lojistik önerisi için randevu ipucu. Erteleme ipucundan farkı: mevcut
 * klinik/otel/transfer değerlerini de taşır — "zaten aynı" durumunu okuyucu
 * görebilsin, boş yere öneri açılmasın.
 */
export type LlmLogisticsAppointmentHint = {
	appointment_id: string;
	contact_display_name: string;
	starts_at: string;
	clinic: string | null;
	hotel: string | null;
	transfer: string | null;
};

export type LlmLogisticsContext = {
	message: string;
	appointments: LlmLogisticsAppointmentHint[];
	tenantPromptNote?: string | null;
	knowledge?: string | null;
};

export type LlmLogisticsResult = {
	suggestions: AppointmentLogisticsDraft[];
	skipped_reason: RecordUpdateSuggestionSkippedReason | null;
	usage: LlmUsageLedger;
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
	/** AI-11a: bilgi bankası çağrısı da `llm.parse` ledger'ına satır yazar. */
	usage: LlmUsageLedger;
};

/**
 * AI-11a — araç seçici bağlamı. Modele **yalnız** maskelenmiş soru ve opak kişi
 * işaretleri gider; DB satırı, isim, telefon, tutar gitmez.
 */
export type MayaToolSelectionContext = {
	/** Maskelenmiş soru: isimler `KISI_n`, PII `[TELEFON]`/`[EPOSTA]` vb. */
	question: string;
	/** Sunucunun çözdüğü kişi adayları — token + opak UUID. Boş olabilir. */
	contacts: MayaContactRef[];
};

export type MayaToolSelectionResult = {
	/**
	 * Seçilen araç çağrısı ya da `null`. `null` iki anlama gelir: soru bilgi bankası
	 * sorusudur ya da hiçbir araç eşleşmedi — ikisinde de tahmin üretilmez.
	 */
	call: MayaToolCall | null;
	usage: LlmUsageLedger;
};

/**
 * KISI-01 adım 3 — kişi özeti girdisi. Her kayıt `ref` ile anılır (W12, R2, P7, N3);
 * model cümleye dayandığı ref'leri ekler. Metinler MASKELİ gelir: kişinin adı
 * `[HASTA]`, telefon/e-posta/IBAN yer tutucu (pii-mask). Model isim görmez.
 */
export type ContactSummaryItem = {
	ref: string;
	kind: 'whatsapp' | 'appointment' | 'transaction' | 'note';
	/** ISO tarih; sıralama ve "ne zaman" için. */
	at: string;
	text: string;
};

/**
 * KISI-02 — tenant'ın hasta akışı şablonu. Yalnız kişi türü **Hasta** olan özetlerde
 * dolu gelir; başka türde `null`/`undefined` olur ve isteme hiçbir şey eklenmez.
 * Şablon modele **veri** olarak, çerçeveli biçimde gider (bkz. `framePatientFlowPrompt`).
 */
export type ContactSummaryPatientFlow = {
	narrative: string;
	checklist: PatientFlowChecklistItem[];
};

export type ContactSummaryContext = {
	items: ContactSummaryItem[];
	/** Yer tutucu; çıktıda geri açılır. */
	subjectToken: string;
	patientFlow?: ContactSummaryPatientFlow | null;
};

export type ContactSummarySentenceDraft = {
	text: string;
	refs: string[];
};

/** Modelden dönen eksik maddesi: yalnız şablondaki id + kısa gerekçe. */
export type ContactSummaryMissingDraft = {
	item_id: string;
	note: string;
};

export type ContactSummaryResult = {
	sentences: ContactSummarySentenceDraft[];
	/**
	 * Kontrol listesinde karşılığı bulunamayan maddeler. Şablon verilmediyse (Hasta
	 * olmayan kişi) ve kural tabanlı yolda **her zaman** boş — tahmin üretilmez.
	 */
	missing: ContactSummaryMissingDraft[];
	heuristic: boolean;
	usage: LlmUsageLedger;
};

/** Domain-facing LLM adapter — WhatsApp parse goes through this, not raw HTTP. */
export interface LlmClient {
	/**
	 * Kişinin akışından kronolojik, kısa, kaynaklı özet. Boş `sentences` = model
	 * yazamadı; çağıran taraf kural tabanlı özete düşer.
	 */
	summarizeContact(ctx: ContactSummaryContext): Promise<ContactSummaryResult>;
	parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult>;
	/** AI-02: appointment.starts_at reschedule drafts — empty when match or date is ambiguous. */
	suggestAppointmentReschedule(ctx: LlmRescheduleContext): Promise<LlmRescheduleResult>;
	/**
	 * Randevunun kliniği / oteli / transferi değişti mi? Boş dizi = okunamadı;
	 * `skipped_reason` nedenini söyler (tahmin üretilmez).
	 */
	suggestAppointmentLogistics(ctx: LlmLogisticsContext): Promise<LlmLogisticsResult>;
	/** Maya soru-cevap. Yalnız bilgi bankasından cevaplar; bilmiyorsa unknown token döner. */
	answerFromKnowledge(ctx: MayaAskContext): Promise<MayaAskResult>;
	/**
	 * AI-11a: canlı veri araç seçimi. Model **yalnız** `{tool, params}` döndürür —
	 * rakamı Postgres verir, cevap cümlesini kod kurar. Model rakamı ne görür ne üretir.
	 */
	selectMayaTool(ctx: MayaToolSelectionContext): Promise<MayaToolSelectionResult>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Durable `jobs.job_type` for LLM/heuristic parse audit + TCO (karne 3.2 / 8.5). */
export const LLM_PARSE_JOB_TYPE = 'llm.parse';
