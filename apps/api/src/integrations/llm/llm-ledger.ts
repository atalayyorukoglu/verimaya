import type { TenantDb } from '../../tenant/tenant-context.service';
import { jobs } from '../../db/schema/queue';
import { DEFAULT_QUEUE_NAME } from '../../queue/queue.service';
import { LLM_PARSE_JOB_TYPE, type LlmUsageLedger } from './llm.types';

/** Write a completed `llm.parse` ledger row (source of truth alongside BullMQ). */
export async function writeLlmParseLedger(
	db: TenantDb,
	tenantId: string,
	usage: LlmUsageLedger
): Promise<void> {
	const now = new Date();
	await db.insert(jobs).values({
		tenantId,
		queue: DEFAULT_QUEUE_NAME,
		jobType: LLM_PARSE_JOB_TYPE,
		payload: {
			provider: usage.provider,
			model: usage.model,
			requested_model: usage.requestedModel,
			prompt_tokens: usage.promptTokens,
			completion_tokens: usage.completionTokens,
			total_tokens: usage.totalTokens,
			estimated_cost_usd_micros: usage.estimatedCostUsdMicros,
			path: usage.path,
			error: usage.error
		},
		status: 'completed',
		attempts: 0,
		startedAt: now,
		completedAt: now
	});
}
