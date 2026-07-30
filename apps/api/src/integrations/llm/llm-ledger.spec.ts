import { describe, expect, it, vi } from 'vitest';
import { writeLlmParseLedger } from './llm-ledger';
import { LLM_PARSE_JOB_TYPE, type LlmUsageLedger } from './llm.types';

describe('writeLlmParseLedger (Adım 25)', () => {
	it('inserts completed llm.parse job with provider/model/tokens', async () => {
		const values = vi.fn(async () => undefined);
		const db = {
			insert: vi.fn(() => ({ values }))
		};

		const usage: LlmUsageLedger = {
			provider: 'openai',
			model: 'gpt-4o-mini-2024-07-18',
			requestedModel: 'gpt-4o-mini',
			promptTokens: 10,
			completionTokens: 5,
			totalTokens: 15,
			estimatedCostUsdMicros: 5,
			path: 'openai_compatible',
			error: null
		};

		await writeLlmParseLedger(db as never, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', usage);

		expect(db.insert).toHaveBeenCalled();
		expect(values).toHaveBeenCalledWith(
			expect.objectContaining({
				jobType: LLM_PARSE_JOB_TYPE,
				status: 'completed',
				payload: expect.objectContaining({
					provider: 'openai',
					model: 'gpt-4o-mini-2024-07-18',
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
					estimated_cost_usd_micros: 5,
					path: 'openai_compatible'
				})
			})
		);
	});
});
