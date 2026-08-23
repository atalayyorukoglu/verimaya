import { Logger } from '@nestjs/common';
import {
	MAYA_UNKNOWN_TOKEN,
	appointmentRescheduleDraftSchema,
	buildMayaSystemPrompt,
	buildMayaToolSelectionSystemPrompt,
	frameKnowledgeContext,
	frameTenantAiPromptNote,
	mayaToolCallSchema,
	transactionDraftSchema,
	toTenantDayKey,
	type AppointmentRescheduleDraft,
	type MayaToolCall,
	type TransactionDraft
} from '@verimaya/shared';
import { heuristicRouteMayaTool } from '../../maya/heuristic-tool-route';
import { heuristicSuggestAppointmentReschedule } from '../../record-suggestions/heuristic-reschedule-parse';
import { verifyDraftEvidence } from '../../whatsapp/evidence';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type {
	LlmClient,
	LlmParseContext,
	LlmParseResult,
	LlmRescheduleContext,
	LlmRescheduleResult,
	LlmUsageLedger,
	MayaAskContext,
	MayaAskResult,
	MayaToolSelectionContext,
	MayaToolSelectionResult
} from './llm.types';
import {
	buildMaskedLlmUserPayload,
	buildMaskedMayaToolPayload,
	buildMaskedReschedulePayload
} from './pii-mask';

export type OpenAiCompatibleLlmConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
	/** Abort fetch after this many ms (default 15_000). */
	timeoutMs?: number;
	fetchFn?: typeof fetch;
};

type ChatCompletionResponse = {
	model?: string;
	choices?: Array<{
		message?: {
			content?: string | null;
		};
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
	};
};

type CallModelOk = {
	records: TransactionDraft[];
	usage: Omit<LlmUsageLedger, 'path' | 'error'>;
};

/** Core extraction contract — always server-owned; tenant notes are appended only. */
export function buildWhatsappExtractionSystemPrompt(
	tenantPromptNote?: string | null,
	knowledge?: string | null,
	/**
	 * Bugünün tarihi (YYYY-MM-DD). Mesajda tarih yoksa model bunu kullanır.
	 * Varsayılan `Europe/Istanbul` — heuristic yolun (`heuristic-parse.ts`) kullandığı
	 * saat dilimiyle aynı, iki yol farklı gün yazmasın diye. Tenant saat dilimi
	 * desteklenirse ikisi birlikte değişmeli.
	 */
	today: string = toTenantDayKey(new Date(), 'Europe/Istanbul')
): string {
	// Alan sözleşmesi AÇIK yazılır. Eksik yazıldığında model zorunlu alanları atlıyor ve
	// bütün çıktı zod doğrulamasında düşüyor — 2026-08-23'te `llm:compare` ile ölçüldü:
	// `title` hiç gelmiyordu, `occurred_on` null geliyordu, üstelik prompt DOMAIN-02
	// öncesinden kalma `patient_id` diyordu (şema `contact_id` bekliyor).
	const core = [
		'You extract finance transaction drafts from WhatsApp messages for a medical tourism ops platform.',
		'Return ONLY valid JSON: {"records":[...]}. Each record MUST contain every required field below.',
		'',
		'REQUIRED fields (a record missing any of these is invalid and will be discarded):',
		'- kind: "income" (money received by us) or "expense" (money paid by us).',
		'- amount: positive integer in MINOR units (kuruş/cents). "2.900 GBP" → 290000. "1500 euro" → 150000.',
		'- currency: one of TRY|GBP|EUR|USD. Turkish words map as: lira/TL→TRY, euro/avro→EUR, dolar→USD, sterlin/pound→GBP.',
		'- title: a SHORT human label for the row, max 80 chars, in the message language. Example: "Ada Klinik ödemesi".',
		`- occurred_on: date in YYYY-MM-DD. If the message states no date, use TODAY = ${today}. NEVER null.`,
		'',
		'OPTIONAL fields: category, subcategory, payment_method, description, contact_id, contact_display_name, contact_label.',
		'- contact_id: ONLY a contact_ref UUID copied from the provided list, or null. Never invent one.',
		'- contact_label: name of the COUNTERPARTY — who received or paid the money.',
		'  It MUST be a name that literally appears in this message. If the message only says',
		'  "kliniğe"/"otele" without naming which one, set contact_label to null. NEVER copy a name',
		'  from the example below or from anywhere other than the message itself.',
		'  Careful: the patient mentioned in a message is often NOT the counterparty.',
		'- payment_method: e.g. "Havale", "Kart", "Nakit" when stated.',
		'',
		'One message may contain SEVERAL transactions — return one record each.',
		'Message text may contain placeholders like [TELEFON]/[EPOSTA]/[HASTA] — ignore them for matching.',
		'For every field you fill FROM THE MESSAGE, add an "evidence" object mapping the field name (amount|currency|kind|occurred_on|contact_id|contact_label|payment_method|category) to {"quote": exact substring copied verbatim from the message, "start": its character offset, "confidence": "high"|"medium"|"low"}; when you inferred a value without reading it, use confidence "low" and quote "".',
		'',
		'IMPORTANT — do not suppress a record because you are unsure about an OPTIONAL field.',
		'If the message describes money moving, ALWAYS emit a record. kind, amount, currency, title and occurred_on are enough.',
		'When the counterparty is unclear, set contact_label to null (or your best literal reading) and keep the record.',
		'Return {"records":[]} ONLY when the message describes no money movement at all.',
		'',
		'Worked example — message: "Yılmaz bey için Ada Klinik\'e 2.900 GBP ödendi"',
		'{"records":[{"kind":"expense","amount":290000,"currency":"GBP","title":"Ada Klinik ödemesi",' +
			`"occurred_on":"${today}",` + '"contact_id":null,"contact_label":"Ada Klinik","category":null,' +
			'"payment_method":null,"description":"Yılmaz bey için Ada Klinik\'e 2.900 GBP ödendi",' +
			'"evidence":{"amount":{"quote":"2.900","start":24,"confidence":"high"},' +
			'"currency":{"quote":"GBP","start":30,"confidence":"high"},' +
			'"kind":{"quote":"ödendi","start":34,"confidence":"high"}}}]}'
	].join('\n');
	// Sıra bilinçli: çekirdek kurallar → bilgi bankası (referans veri) → tenant notu.
	// İkisi de veri olarak çerçevelenir; hiçbiri çekirdeği ezemez.
	const framedKnowledge = frameKnowledgeContext(knowledge);
	const framedNote = frameTenantAiPromptNote(tenantPromptNote ?? '');
	return [core, framedKnowledge, framedNote].filter(Boolean).join('\n\n');
}

/** AI-02 — appointment.starts_at reschedule extraction (human approval required downstream). */
export function buildRescheduleExtractionSystemPrompt(
	tenantPromptNote?: string | null,
	knowledge?: string | null
): string {
	const core = [
		'You extract appointment reschedule suggestions from operational messages for a medical tourism platform.',
		'Return ONLY valid JSON: {"suggestions":[...]} where each item has appointment_id (UUID from provided list), suggested_value (ISO-8601 UTC), confidence ("high"|"medium"), reason (short source excerpt).',
		'Only suggest when BOTH the target appointment AND the new date/time are unambiguous. If multiple appointments could match, or the date is unclear, return {"suggestions":[]}.',
		'Never output confidence "low" — omit instead.',
		'appointment_id must be one of the appointment_ref UUIDs provided; never invent IDs.',
		'Message text may contain placeholders like [HASTA] — ignore them for matching.'
	].join(' ');
	const framedKnowledge = frameKnowledgeContext(knowledge);
	const framedNote = frameTenantAiPromptNote(tenantPromptNote ?? '');
	return [core, framedKnowledge, framedNote].filter(Boolean).join('\n\n');
}

function parseReschedulePayload(raw: unknown): AppointmentRescheduleDraft[] {
	if (!raw || typeof raw !== 'object') {
		throw new Error('LLM JSON root must be an object');
	}
	const suggestions = (raw as { suggestions?: unknown }).suggestions;
	if (!Array.isArray(suggestions)) {
		throw new Error('LLM JSON missing suggestions array');
	}

	const out: AppointmentRescheduleDraft[] = [];
	for (const item of suggestions) {
		const parsed = appointmentRescheduleDraftSchema.safeParse(item);
		if (!parsed.success) {
			throw new Error(`LLM reschedule validation failed: ${parsed.error.message}`);
		}
		out.push(parsed.data);
	}
	return out;
}

/**
 * AI-11a — model çıktısından **yalnız** `tool` ve `params` okunur.
 *
 * Model gövdeye cevap cümlesi, tutar ya da isim eklerse o alanlar hiç okunmaz; ayrıca
 * `params` `.strict()` olduğu için uydurma bir alan doğrulamayı düşürür ve çağrı
 * deterministik yönlendiriciye devredilir. Her iki yolda da modelin ürettiği veri
 * UI'a düşmez.
 *
 * `tool: null` **hata değildir**: model "bu bir bilgi bankası sorusu / araç yok" demiştir.
 */
function parseMayaToolCallPayload(raw: unknown): MayaToolCall | null {
	if (!raw || typeof raw !== 'object') {
		throw new Error('LLM JSON root must be an object');
	}
	const tool = (raw as { tool?: unknown }).tool;
	if (tool == null) return null;

	const parsed = mayaToolCallSchema.safeParse({
		tool,
		params: (raw as { params?: unknown }).params ?? {}
	});
	if (!parsed.success) {
		throw new Error(`LLM maya tool validation failed: ${parsed.error.message}`);
	}
	return parsed.data;
}

/**
 * PII yer tutucularını taslak metin alanlarından temizler.
 *
 * Neden gerekli (2026-08-23, gerçek muhasebe konuşmasıyla ölçüldü): modele maskelenmiş
 * metin gidiyor ("Dexy Murphy" → "[HASTA]"), model de karşı taraf adı olarak yer tutucuyu
 * geri veriyor. Temizlenmezse kayda `contact_label: "[HASTA]"` yazılır — kullanıcı için
 * anlamsız, rapor için gürültü.
 *
 * Kimlik `contact_id` (opak `patient_ref` UUID) üzerinden zaten doğru çözülüyor; burada
 * yalnız serbest metin alanları temizlenir. Alan tamamen yer tutucudan ibaretse null olur.
 */
function stripPlaceholders(records: TransactionDraft[]): TransactionDraft[] {
	const placeholder = /\[(TELEFON|EPOSTA|TCKN|IBAN|KART|HASTA)\]/g;
	const clean = (value: string | null | undefined): string | null => {
		if (!value) return null;
		const stripped = value.replace(placeholder, '').replace(/\s{2,}/g, ' ').trim();
		return stripped.length > 0 ? stripped : null;
	};
	return records.map((record) => ({
		...record,
		contact_label: clean(record.contact_label),
		contact_display_name: clean(record.contact_display_name),
		title: clean(record.title) ?? record.title,
		description: record.description ?? null
	}));
}

function parseDraftsPayload(raw: unknown): TransactionDraft[] {
	if (!raw || typeof raw !== 'object') {
		throw new Error('LLM JSON root must be an object');
	}
	const records = (raw as { records?: unknown }).records;
	if (!Array.isArray(records)) {
		throw new Error('LLM JSON missing records array');
	}

	const out: TransactionDraft[] = [];
	for (const item of records) {
		const parsed = transactionDraftSchema.safeParse(item);
		if (!parsed.success) {
			throw new Error(`LLM draft validation failed: ${parsed.error.message}`);
		}
		out.push(parsed.data);
	}
	return out;
}

function providerLabel(baseUrl: string): string {
	try {
		const host = new URL(baseUrl).hostname.toLowerCase();
		if (host === 'api.openai.com' || host.endsWith('.openai.com')) return 'openai';
		return 'openai_compatible';
	} catch {
		return 'openai_compatible';
	}
}

/**
 * Rough gpt-4o-mini-class pricing for TCO (karne 8.5). Not billed truth — ledger estimate only.
 * Input $0.15 / 1M, output $0.60 / 1M → microdollars.
 */
export function estimateCostUsdMicros(
	promptTokens: number | null,
	completionTokens: number | null
): number | null {
	if (promptTokens == null && completionTokens == null) return null;
	const inTok = promptTokens ?? 0;
	const outTok = completionTokens ?? 0;
	return Math.round(inTok * 0.15 + outTok * 0.6);
}

/**
 * OpenAI-compatible chat completions client (OpenAI, Azure-compat, local gateways).
 * On any failure, falls back to the heuristic parser so inbox processing stays available.
 * External HTTP always goes through {@link buildMaskedLlmUserPayload} (PII choke point).
 */
export class OpenAiCompatibleLlmClient implements LlmClient {
	private readonly logger = new Logger(OpenAiCompatibleLlmClient.name);
	private readonly fetchFn: typeof fetch;
	private readonly timeoutMs: number;

	constructor(private readonly config: OpenAiCompatibleLlmConfig) {
		this.fetchFn = config.fetchFn ?? fetch;
		this.timeoutMs = config.timeoutMs ?? 15_000;
	}

	async parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult> {
		try {
			const ok = await this.callModel(ctx);
			if (ok.records.length > 0) {
				return {
					records: ok.records,
					usage: { ...ok.usage, path: 'openai_compatible', error: null }
				};
			}
			// Empty LLM result — still ledger the call, then heuristic for UX.
			const records = heuristicParseWhatsappMessage(ctx.message, ctx.patients);
			return {
				records,
				usage: {
					...ok.usage,
					path: 'openai_compatible_fallback',
					error: 'empty_llm_records'
				}
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`LLM parse failed, falling back to heuristic: ${message}`);
			const records = heuristicParseWhatsappMessage(ctx.message, ctx.patients);
			return {
				records,
				usage: {
					provider: providerLabel(this.config.baseUrl),
					model: 'heuristic-parse',
					requestedModel: this.config.model,
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					estimatedCostUsdMicros: null,
					path: 'openai_compatible_fallback',
					error: message
				}
			};
		}
	}

	async suggestAppointmentReschedule(ctx: LlmRescheduleContext): Promise<LlmRescheduleResult> {
		try {
			const ok = await this.callRescheduleModel(ctx);
			if (ok.suggestions.length > 0) {
				return {
					suggestions: ok.suggestions,
					skipped_reason: null,
					usage: { ...ok.usage, path: 'openai_compatible', error: null }
				};
			}
			// Empty LLM output — no inventable skip reason from the model; heuristic may diagnose.
			const parsed = heuristicSuggestAppointmentReschedule(ctx.message, ctx.appointments);
			return {
				suggestions: parsed.drafts,
				skipped_reason: parsed.skipped_reason,
				usage: {
					...ok.usage,
					path: 'openai_compatible_fallback',
					error: 'empty_llm_suggestions'
				}
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`LLM reschedule failed, falling back to heuristic: ${message}`);
			const parsed = heuristicSuggestAppointmentReschedule(ctx.message, ctx.appointments);
			return {
				suggestions: parsed.drafts,
				skipped_reason: parsed.skipped_reason,
				usage: {
					provider: providerLabel(this.config.baseUrl),
					model: 'heuristic-reschedule',
					requestedModel: this.config.model,
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					estimatedCostUsdMicros: null,
					path: 'openai_compatible_fallback',
					error: message
				}
			};
		}
	}

	/**
	 * Maya soru-cevap. Çekirdek kural: **yalnız bilgi bankasından cevapla, yoksa
	 * BILINMIYOR de.** Bilgi bankası boşsa LLM'e hiç gidilmez (para ve gecikme boşa gitmesin,
	 * ayrıca boş bağlamla model uydurmaya daha yatkındır).
	 *
	 * Hata hâlinde heuristic'e düşmez — sessizce farklı bir cevap üretmektense
	 * "bilmiyorum" demek doğrudur; kullanıcı yanlış bilgiye güvenmemeli.
	 */
	async answerFromKnowledge(ctx: MayaAskContext): Promise<MayaAskResult> {
		const failed = (error: string | null): MayaAskResult => ({
			answer: MAYA_UNKNOWN_TOKEN,
			heuristic: false,
			usage: {
				provider: providerLabel(this.config.baseUrl),
				model: null,
				requestedModel: this.config.model,
				promptTokens: null,
				completionTokens: null,
				totalTokens: null,
				estimatedCostUsdMicros: null,
				path: 'openai_compatible_fallback',
				error
			}
		});

		if (!ctx.knowledge) return failed('empty_knowledge');

		const base = this.config.baseUrl.replace(/\/$/, '');
		const system = `${buildMayaSystemPrompt()}\n\n${frameKnowledgeContext(ctx.knowledge)}`;

		try {
			const response = await this.fetchFn(`${base}/chat/completions`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					authorization: `Bearer ${this.config.apiKey}`
				},
				body: JSON.stringify({
					model: this.config.model,
					temperature: 0,
					messages: [
						{ role: 'system', content: system },
						{ role: 'user', content: ctx.question }
					]
				}),
				signal: AbortSignal.timeout(this.timeoutMs)
			});

			if (!response.ok) {
				// Gövde loglanmaz (AUDIT-03) — sağlayıcılar isteği geri yansıtabiliyor.
				this.logger.warn(`Maya LLM HTTP ${response.status}`);
				return failed(`http_${response.status}`);
			}

			const json = (await response.json()) as ChatCompletionResponse;
			const content = json.choices?.[0]?.message?.content;
			if (!content || typeof content !== 'string') {
				return failed('missing_content');
			}

			const promptTokens = json.usage?.prompt_tokens ?? null;
			const completionTokens = json.usage?.completion_tokens ?? null;
			return {
				answer: content.trim(),
				heuristic: false,
				usage: {
					provider: providerLabel(this.config.baseUrl),
					model:
						typeof json.model === 'string' && json.model.trim()
							? json.model.trim()
							: this.config.model,
					requestedModel: this.config.model,
					promptTokens,
					completionTokens,
					totalTokens:
						json.usage?.total_tokens ??
						(promptTokens != null && completionTokens != null
							? promptTokens + completionTokens
							: null),
					estimatedCostUsdMicros: estimateCostUsdMicros(promptTokens, completionTokens),
					path: 'openai_compatible',
					error: null
				}
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Maya LLM call failed: ${message}`);
			return failed(message);
		}
	}

	/**
	 * AI-11a — canlı veri araç seçimi.
	 *
	 * Modele giden gövde `buildMaskedMayaToolPayload`'dan geçer (isim/telefon yok),
	 * dönen gövdeden yalnız `{tool, params}` okunur. Model bir rakam üretemez çünkü
	 * sözleşmede rakam alanı yok; ürettiğini iddia ederse doğrulama düşer.
	 *
	 * Hata/geçersiz çıktı hâlinde deterministik yönlendiriciye düşülür — bu bir tahmin
	 * değil, kelime eşlemesidir; cevap yine Postgres'ten gelir ve izin yine kontrol edilir.
	 * Modelin **açıkça** `tool: null` demesi hata sayılmaz ve yönlendiriciyle ezilmez.
	 */
	async selectMayaTool(ctx: MayaToolSelectionContext): Promise<MayaToolSelectionResult> {
		try {
			const ok = await this.callMayaToolModel(ctx);
			return { call: ok.call, usage: { ...ok.usage, path: 'openai_compatible', error: null } };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Maya tool selection failed, falling back to heuristic: ${message}`);
			return {
				call: heuristicRouteMayaTool(ctx.question, ctx.contacts),
				usage: {
					provider: providerLabel(this.config.baseUrl),
					model: 'heuristic-maya-tool',
					requestedModel: this.config.model,
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					estimatedCostUsdMicros: null,
					path: 'openai_compatible_fallback',
					error: message
				}
			};
		}
	}

	private async callMayaToolModel(ctx: MayaToolSelectionContext): Promise<{
		call: MayaToolCall | null;
		usage: Omit<LlmUsageLedger, 'path' | 'error'>;
	}> {
		const maskedUser = buildMaskedMayaToolPayload(ctx);
		const base = this.config.baseUrl.replace(/\/$/, '');

		const response = await this.fetchFn(`${base}/chat/completions`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${this.config.apiKey}`
			},
			body: JSON.stringify({
				model: this.config.model,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: buildMayaToolSelectionSystemPrompt() },
					{ role: 'user', content: JSON.stringify(maskedUser) }
				]
			}),
			signal: AbortSignal.timeout(this.timeoutMs)
		});

		if (!response.ok) {
			// AUDIT-03: gövde loglanmaz — sağlayıcılar isteği geri yansıtabiliyor.
			const body = await response.text().catch(() => '');
			const contentType = response.headers.get('content-type') ?? 'unknown';
			throw new Error(
				`LLM HTTP ${response.status} (${contentType}, body ${body.length} bytes redacted)`
			);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		const content = json.choices?.[0]?.message?.content;
		if (!content || typeof content !== 'string') {
			throw new Error('LLM response missing message content');
		}

		const call = parseMayaToolCallPayload(JSON.parse(content) as unknown);

		const promptTokens = json.usage?.prompt_tokens ?? null;
		const completionTokens = json.usage?.completion_tokens ?? null;
		const totalTokens =
			json.usage?.total_tokens ??
			(promptTokens != null && completionTokens != null
				? promptTokens + completionTokens
				: null);
		const actualModel =
			typeof json.model === 'string' && json.model.trim() ? json.model.trim() : this.config.model;

		return {
			call,
			usage: {
				provider: providerLabel(this.config.baseUrl),
				model: actualModel,
				requestedModel: this.config.model,
				promptTokens,
				completionTokens,
				totalTokens,
				estimatedCostUsdMicros: estimateCostUsdMicros(promptTokens, completionTokens)
			}
		};
	}

	private async callModel(ctx: LlmParseContext): Promise<CallModelOk> {
		const maskedUser = buildMaskedLlmUserPayload(ctx);

		const system = buildWhatsappExtractionSystemPrompt(ctx.tenantPromptNote, ctx.knowledge);

		const user = JSON.stringify(maskedUser);

		const base = this.config.baseUrl.replace(/\/$/, '');
		const url = `${base}/chat/completions`;

		const response = await this.fetchFn(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${this.config.apiKey}`
			},
			body: JSON.stringify({
				model: this.config.model,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			}),
			signal: AbortSignal.timeout(this.timeoutMs)
		});

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			// AUDIT-03 (Faz 8): never log the upstream response body. LLM providers
			// commonly echo the request body back in 4xx/5xx responses, which can
			// contain patient names / phone numbers / medical context. Log status
			// + content-type only; raw body is captured in the thrown Error for
			// engineering debugging (Sentry) but not serialized to stdout.
			const contentType = response.headers.get('content-type') ?? 'unknown';
			throw new Error(
				`LLM HTTP ${response.status} (${contentType}, body ${body.length} bytes redacted)`
			);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		const content = json.choices?.[0]?.message?.content;
		if (!content || typeof content !== 'string') {
			throw new Error('LLM response missing message content');
		}

		const parsedJson: unknown = JSON.parse(content);
		// AI-09: atıf doğrulaması maskeli metne karşı — model yalnız onu gördü.
		// `start` ham metne göre yeniden hesaplanır (vurgulama orada yapılıyor).
		const records = stripPlaceholders(
			verifyDraftEvidence(parseDraftsPayload(parsedJson), maskedUser.message, ctx.message)
		);

		const promptTokens = json.usage?.prompt_tokens ?? null;
		const completionTokens = json.usage?.completion_tokens ?? null;
		const totalTokens =
			json.usage?.total_tokens ??
			(promptTokens != null && completionTokens != null
				? promptTokens + completionTokens
				: null);

		// Ledger uses the response `model` field (provider truth), not env request.
		const actualModel =
			typeof json.model === 'string' && json.model.trim() ? json.model.trim() : this.config.model;

		return {
			records,
			usage: {
				provider: providerLabel(this.config.baseUrl),
				model: actualModel,
				requestedModel: this.config.model,
				promptTokens,
				completionTokens,
				totalTokens,
				estimatedCostUsdMicros: estimateCostUsdMicros(promptTokens, completionTokens)
			}
		};
	}

	private async callRescheduleModel(ctx: LlmRescheduleContext): Promise<{
		suggestions: AppointmentRescheduleDraft[];
		usage: Omit<LlmUsageLedger, 'path' | 'error'>;
	}> {
		const maskedUser = buildMaskedReschedulePayload(ctx);
		const system = buildRescheduleExtractionSystemPrompt(ctx.tenantPromptNote, ctx.knowledge);
		const user = JSON.stringify(maskedUser);

		const base = this.config.baseUrl.replace(/\/$/, '');
		const url = `${base}/chat/completions`;

		const response = await this.fetchFn(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${this.config.apiKey}`
			},
			body: JSON.stringify({
				model: this.config.model,
				temperature: 0,
				response_format: { type: 'json_object' },
				messages: [
					{ role: 'system', content: system },
					{ role: 'user', content: user }
				]
			}),
			signal: AbortSignal.timeout(this.timeoutMs)
		});

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			const contentType = response.headers.get('content-type') ?? 'unknown';
			throw new Error(
				`LLM HTTP ${response.status} (${contentType}, body ${body.length} bytes redacted)`
			);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		const content = json.choices?.[0]?.message?.content;
		if (!content || typeof content !== 'string') {
			throw new Error('LLM response missing message content');
		}

		const parsedJson: unknown = JSON.parse(content);
		const allowedIds = new Set(ctx.appointments.map((a) => a.appointment_id));
		const suggestions = parseReschedulePayload(parsedJson).filter((s) =>
			allowedIds.has(s.appointment_id)
		);

		const promptTokens = json.usage?.prompt_tokens ?? null;
		const completionTokens = json.usage?.completion_tokens ?? null;
		const totalTokens =
			json.usage?.total_tokens ??
			(promptTokens != null && completionTokens != null
				? promptTokens + completionTokens
				: null);

		const actualModel =
			typeof json.model === 'string' && json.model.trim() ? json.model.trim() : this.config.model;

		return {
			suggestions,
			usage: {
				provider: providerLabel(this.config.baseUrl),
				model: actualModel,
				requestedModel: this.config.model,
				promptTokens,
				completionTokens,
				totalTokens,
				estimatedCostUsdMicros: estimateCostUsdMicros(promptTokens, completionTokens)
			}
		};
	}
}
