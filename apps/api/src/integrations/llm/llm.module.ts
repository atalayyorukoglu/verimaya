import { Module } from '@nestjs/common';
import { HeuristicLlmClient } from './heuristic-llm.client';
import { OpenAiCompatibleLlmClient } from './openai-compatible-llm.client';
import { LLM_CLIENT, type LlmClient } from './llm.types';

/** Env → client selection (Adım 21 / 25). Exported for unit tests. */
export function createLlmClientFromEnv(
	env: NodeJS.ProcessEnv = process.env
): LlmClient {
	const apiKey = env.LLM_API_KEY?.trim();
	if (!apiKey) {
		return new HeuristicLlmClient();
	}

	const baseUrl = (env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, '');
	const model = env.LLM_MODEL?.trim() || 'gpt-4o-mini';
	const timeoutRaw = env.LLM_TIMEOUT_MS?.trim();
	const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;

	return new OpenAiCompatibleLlmClient({
		apiKey,
		baseUrl,
		model,
		timeoutMs: Number.isFinite(timeoutMs) && (timeoutMs as number) > 0 ? timeoutMs : undefined
	});
}

@Module({
	providers: [
		HeuristicLlmClient,
		{
			provide: LLM_CLIENT,
			useFactory: () => createLlmClientFromEnv()
		}
	],
	exports: [LLM_CLIENT]
})
export class LlmModule {}
