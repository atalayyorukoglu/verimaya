import { Injectable } from '@nestjs/common';
import { heuristicParseWhatsappMessage } from '../../whatsapp/heuristic-parse';
import type { LlmClient, LlmParseContext, LlmParseResult } from './llm.types';

/** Deterministic regex/heuristic parser used when no LLM_API_KEY is set. */
@Injectable()
export class HeuristicLlmClient implements LlmClient {
	async parseTransactionDrafts(ctx: LlmParseContext): Promise<LlmParseResult> {
		const records = heuristicParseWhatsappMessage(ctx.message, ctx.patients);
		return {
			records,
			usage: {
				provider: 'heuristic',
				model: 'heuristic-parse',
				requestedModel: null,
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				estimatedCostUsdMicros: 0,
				path: 'heuristic',
				error: null
			}
		};
	}
}
