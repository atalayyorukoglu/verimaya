import type { Patient, TransactionDraft } from '@verimaya/shared';

export type LlmParseContext = {
	message: string;
	patients: Patient[];
};

/** Domain-facing LLM adapter — WhatsApp parse goes through this, not raw HTTP. */
export interface LlmClient {
	parseTransactionDrafts(ctx: LlmParseContext): Promise<TransactionDraft[]>;
}

export const LLM_CLIENT = Symbol('LLM_CLIENT');
