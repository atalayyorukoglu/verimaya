import { Injectable } from '@nestjs/common';
import { desc, sql } from 'drizzle-orm';
import type {
	AiCorrectionCreate,
	AiCorrectionsReport,
	AiCorrectionsReportParams,
	AiCorrectionsReportRow
} from '@verimaya/shared';
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

	/**
	 * GAP-F09-15: field-level error frequency over the full period (no pagination).
	 * Expands jsonb draft pairs in SQL, then GROUP BY field — same field set as
	 * `AI_CORRECTION_COMPARE_FIELDS` in @verimaya/shared.
	 */
	async report(tenantId: string, params: AiCorrectionsReportParams): Promise<AiCorrectionsReport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const fromFilter = params.from
				? sql`AND c.created_at >= ${params.from}::date`
				: sql``;
			const toFilter = params.to
				? sql`AND c.created_at < (${params.to}::date + interval '1 day')`
				: sql``;

			const result = await db.execute(sql`
				WITH paired AS (
					SELECT
						c.id AS correction_id,
						c.inbound_message_id,
						orig.elem AS original,
						corr.elem AS corrected
					FROM ai_corrections c
					CROSS JOIN LATERAL jsonb_array_elements(c.original_parsed)
						WITH ORDINALITY AS orig(elem, ord)
					CROSS JOIN LATERAL jsonb_array_elements(c.corrected)
						WITH ORDINALITY AS corr(elem, ord)
					WHERE orig.ord = corr.ord
					${fromFilter}
					${toFilter}
				),
				diffs AS (
					SELECT
						correction_id,
						inbound_message_id,
						f.field
					FROM paired
					CROSS JOIN LATERAL (
						VALUES
							(
								'kind',
								(original->>'kind') IS DISTINCT FROM (corrected->>'kind')
							),
							(
								'amount',
								(original->>'amount') IS DISTINCT FROM (corrected->>'amount')
							),
							(
								'currency',
								(original->>'currency') IS DISTINCT FROM (corrected->>'currency')
							),
							(
								'counterparty_amount',
								(original->>'counterparty_amount')
									IS DISTINCT FROM (corrected->>'counterparty_amount')
							),
							(
								'title',
								nullif(original->>'title', '')
									IS DISTINCT FROM nullif(corrected->>'title', '')
							),
							(
								'category',
								nullif(original->>'category', '')
									IS DISTINCT FROM nullif(corrected->>'category', '')
							),
							(
								'subcategory',
								nullif(original->>'subcategory', '')
									IS DISTINCT FROM nullif(corrected->>'subcategory', '')
							),
							(
								'patient_id',
								nullif(original->>'patient_id', '')
									IS DISTINCT FROM nullif(corrected->>'patient_id', '')
							),
							(
								'patient_display_name',
								nullif(original->>'patient_display_name', '')
									IS DISTINCT FROM nullif(corrected->>'patient_display_name', '')
							),
							(
								'contact_label',
								nullif(original->>'contact_label', '')
									IS DISTINCT FROM nullif(corrected->>'contact_label', '')
							),
							(
								'occurred_on',
								(original->>'occurred_on') IS DISTINCT FROM (corrected->>'occurred_on')
							),
							(
								'payment_method',
								nullif(original->>'payment_method', '')
									IS DISTINCT FROM nullif(corrected->>'payment_method', '')
							),
							(
								'description',
								nullif(original->>'description', '')
									IS DISTINCT FROM nullif(corrected->>'description', '')
							)
					) AS f(field, differs)
					WHERE f.differs
				)
				SELECT
					field,
					count(*)::int AS correction_count,
					count(DISTINCT coalesce(inbound_message_id::text, correction_id::text))::int
						AS distinct_messages
				FROM diffs
				GROUP BY field
				ORDER BY correction_count DESC, field ASC
			`);

			const items: AiCorrectionsReportRow[] = [...result].map((row) => ({
				field: String(row.field),
				correction_count: Number(row.correction_count),
				distinct_messages: Number(row.distinct_messages)
			}));

			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				items
			};
		});
	}
}
