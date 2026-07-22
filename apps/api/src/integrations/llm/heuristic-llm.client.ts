import { Injectable } from '@nestjs/common';
import type { TransactionDraft } from '@verimaya/shared';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type { LlmClient, LlmParseContext } from './llm.types';

/** Deterministic regex/heuristic parser used when no LLM_API_KEY is set. */
@Injectable()
export class HeuristicLlmClient implements LlmClient {
	async parseTransactionDrafts(ctx: LlmParseContext): Promise<TransactionDraft[]> {
		return heuristicParseWhatsappMessage(ctx.message, ctx.patients);
	}
}
