import { Module } from '@nestjs/common';
import { HeuristicLlmClient } from './heuristic-llm.client';
import { OpenAiCompatibleLlmClient } from './openai-compatible-llm.client';
import { LLM_CLIENT, type LlmClient } from './llm.types';

function createLlmClient(): LlmClient {
	const apiKey = process.env.LLM_API_KEY?.trim();
	if (!apiKey) {
		return new HeuristicLlmClient();
	}

	const baseUrl = (process.env.LLM_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(
		/\/$/,
		''
	);
	const model = process.env.LLM_MODEL?.trim() || 'gpt-4o-mini';

	return new OpenAiCompatibleLlmClient({ apiKey, baseUrl, model });
}

@Module({
	providers: [
		HeuristicLlmClient,
		{
			provide: LLM_CLIENT,
			useFactory: createLlmClient
		}
	],
	exports: [LLM_CLIENT]
})
export class LlmModule {}
