import { Logger } from '@nestjs/common';
import {
	frameTenantAiPromptNote,
	transactionDraftSchema,
	type TransactionDraft
} from '@verimaya/shared';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type {
	LlmClient,
	LlmParseContext,
	LlmParseResult,
	LlmUsageLedger
} from './llm.types';
import { buildMaskedLlmUserPayload } from './pii-mask';

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
export function buildWhatsappExtractionSystemPrompt(tenantPromptNote?: string | null): string {
	const core = [
		'You extract finance transaction drafts from WhatsApp messages for a medical tourism ops platform.',
		'Return ONLY valid JSON: {"records":[...]} matching TransactionDraft fields.',
		'amount is integer minor units (kuruş/cents). currency is TRY|GBP|EUR|USD.',
		'kind is income|expense. Do not invent patients; set patient_id only to a patient_ref UUID from the provided list (or null).',
		'Message text may contain placeholders like [TELEFON]/[EPOSTA]/[HASTA] — ignore them for matching.',
		'If nothing can be extracted, return {"records":[]}.'
	].join(' ');
	const framed = frameTenantAiPromptNote(tenantPromptNote ?? '');
	return framed ? `${core}\n\n${framed}` : core;
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

	private async callModel(ctx: LlmParseContext): Promise<CallModelOk> {
		const maskedUser = buildMaskedLlmUserPayload(ctx);

		const system = buildWhatsappExtractionSystemPrompt(ctx.tenantPromptNote);

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
}
