import { Logger } from '@nestjs/common';
import { transactionDraftSchema, type TransactionDraft } from '@verimaya/shared';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type { LlmClient, LlmParseContext } from './llm.types';
import { buildMaskedLlmUserPayload } from './pii-mask';

export type OpenAiCompatibleLlmConfig = {
	apiKey: string;
	baseUrl: string;
	model: string;
};

type ChatCompletionResponse = {
	choices?: Array<{
		message?: {
			content?: string | null;
		};
	}>;
};

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

/**
 * OpenAI-compatible chat completions client (OpenAI, Azure-compat, local gateways).
 * On any failure, falls back to the heuristic parser so inbox processing stays available.
 * External HTTP always goes through {@link buildMaskedLlmUserPayload} (PII choke point).
 */
export class OpenAiCompatibleLlmClient implements LlmClient {
	private readonly logger = new Logger(OpenAiCompatibleLlmClient.name);

	constructor(private readonly config: OpenAiCompatibleLlmConfig) {}

	async parseTransactionDrafts(ctx: LlmParseContext): Promise<TransactionDraft[]> {
		try {
			const records = await this.callModel(ctx);
			if (records.length > 0) return records;
		} catch (err) {
			this.logger.warn(
				`LLM parse failed, falling back to heuristic: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		// Heuristic uses the original (unmasked) message — masking is LLM-egress only.
		return heuristicParseWhatsappMessage(ctx.message, ctx.patients);
	}

	private async callModel(ctx: LlmParseContext): Promise<TransactionDraft[]> {
		const maskedUser = buildMaskedLlmUserPayload(ctx);

		const system = [
			'You extract finance transaction drafts from WhatsApp messages for a medical tourism ops platform.',
			'Return ONLY valid JSON: {"records":[...]} matching TransactionDraft fields.',
			'amount is integer minor units (kuruş/cents). currency is TRY|GBP|EUR|USD.',
			'kind is income|expense. Do not invent patients; set patient_id only to a patient_ref UUID from the provided list (or null).',
			'Message text may contain placeholders like [TELEFON]/[EPOSTA]/[HASTA] — ignore them for matching.',
			'If nothing can be extracted, return {"records":[]}.'
		].join(' ');

		const user = JSON.stringify(maskedUser);

		const base = this.config.baseUrl.replace(/\/$/, '');
		const url = `${base}/chat/completions`;

		const response = await fetch(url, {
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
			})
		});

		if (!response.ok) {
			const body = await response.text().catch(() => '');
			throw new Error(`LLM HTTP ${response.status}: ${body.slice(0, 200)}`);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		const content = json.choices?.[0]?.message?.content;
		if (!content || typeof content !== 'string') {
			throw new Error('LLM response missing message content');
		}

		const parsedJson: unknown = JSON.parse(content);
		return parseDraftsPayload(parsedJson);
	}
}
