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
	type AppointmentRescheduleDraft,
	type MayaToolCall,
	type TransactionDraft
} from '@verimaya/shared';
import { heuristicRouteMayaTool } from '../../maya/heuristic-tool-route';
import { heuristicSuggestAppointmentReschedule } from '../../record-suggestions/heuristic-reschedule-parse';
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
	knowledge?: string | null
): string {
	const core = [
		'You extract finance transaction drafts from WhatsApp messages for a medical tourism ops platform.',
		'Return ONLY valid JSON: {"records":[...]} matching TransactionDraft fields.',
		'amount is integer minor units (kuruş/cents). currency is TRY|GBP|EUR|USD.',
		'kind is income|expense. Do not invent patients; set patient_id only to a patient_ref UUID from the provided list (or null).',
		'Message text may contain placeholders like [TELEFON]/[EPOSTA]/[HASTA] — ignore them for matching.',
		'If nothing can be extracted, return {"records":[]}.'
	].join(' ');
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
		const records = parseDraftsPayload(parsedJson);

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
