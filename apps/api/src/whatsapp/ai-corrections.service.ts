import { Injectable } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import type { AiCorrectionCreate } from '@verimaya/shared';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAiCorrection } from '../common/mappers';
import { aiCorrections } from '../db/schema/ai-corrections';
import { TenantContextService } from '../tenant/tenant-context.service';

@Injectable()
export class AiCorrectionsService {
	constructor(private readonly tenantContext: TenantContextService) {}

	/** Records the diff between the AI-parsed drafts and what the human actually saved. */
	async create(tenantId: string, input: AiCorrectionCreate, createdBy: string | null) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const [row] = await db
				.insert(aiCorrections)
				.values({
					tenantId,
					inboundMessageId: input.inbound_message_id ?? null,
					originalParsed: input.original_parsed,
					corrected: input.corrected,
					createdBy
				})
				.returning();

			return toAiCorrection(row!);
		});
	}

	async list(tenantId: string, params: { cursor?: string; limit: number }) {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const cursorCond = createdAtCursorCondition(
				aiCorrections.createdAt,
				aiCorrections.id,
				params.cursor
			);
			const rows = await db
				.select()
				.from(aiCorrections)
				.where(cursorCond)
				.orderBy(desc(aiCorrections.createdAt), desc(aiCorrections.id))
				.limit(params.limit + 1);

			const page = buildCursorPage(rows, params.limit);
			return {
				items: page.items.map(toAiCorrection),
				next_cursor: page.next_cursor
			};
		});
	}
}
