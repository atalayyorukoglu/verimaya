import type { Contact, TransactionDraft } from '@verimaya/shared';

export type LlmParseContext = {
	message: string;
	/** Hasta-type contacts used as opaque match hints (AGENTS ilke 6 — drafts only). */
	patients: Contact[];
	/**
	 * Optional tenant operational note (G-26). Appended to the core system prompt
	 * as framed non-instructional context; never replaces server output schema rules.
	 */
	tenantPromptNote?: string | null;
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

/** Domain-facing LLM adapter — WhatsApp parse goes through this, not raw HTTP. */
export interface LlmClient {
	parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');

/** Durable `jobs.job_type` for LLM/heuristic parse audit + TCO (karne 3.2 / 8.5). */
export const LLM_PARSE_JOB_TYPE = 'llm.parse';
