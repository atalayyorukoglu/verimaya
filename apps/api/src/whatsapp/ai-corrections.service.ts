import { Injectable } from '@nestjs/common';
import { desc, sql, type SQL } from 'drizzle-orm';
import type {
	AiCorrectionCreate,
	AiCorrectionsReport,
	AiCorrectionsReportParams,
	AiCorrectionsReportRow
} from '@verimaya/shared';
import { buildCursorPage, createdAtCursorCondition } from '../common/list-query';
import { toAiCorrection } from '../common/mappers';
import { aiCorrections } from '../db/schema/ai-corrections';
import { TenantContextService, type TenantDb } from '../tenant/tenant-context.service';

/**
 * GAP-F09-15 / AI-03 — draft-field diff detection shared by both aggregation queries
 * below. Field keys **must** stay in sync with `AI_CORRECTION_COMPARE_FIELDS` in
 * @verimaya/shared. `contact_id`/`contact_display_name` (not `patient_id` — DOMAIN-02
 * renamed the column; fixed 2026-08-22, AI-03: the old keys never matched a jsonb key
 * so those two fields' corrections were silently never counted).
 */
const FIELD_DIFF_VALUES = sql`
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
			'contact_id',
			nullif(original->>'contact_id', '')
				IS DISTINCT FROM nullif(corrected->>'contact_id', '')
		),
		(
			'contact_display_name',
			nullif(original->>'contact_display_name', '')
				IS DISTINCT FROM nullif(corrected->>'contact_display_name', '')
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
`;

/**
 * AI-03 — field × AI-09 confidence breakdown for one tenant/period.
 *
 * The confidence a field had **at parse time** only survives on the approved
 * transaction row when the field was *not* corrected (`evidenceForApprovedDraft`
 * drops evidence for anything the human overwrote — see `whatsapp/evidence.ts`).
 * So the only place the pre-correction confidence still exists for a *corrected*
 * field is `inbound_messages.payload.parsed_records[].evidence`, joined back by
 * `ai_corrections.inbound_message_id` and matched by array position (both arrays
 * come from the same draft list, in the same order — see `ai-transaction/+page.svelte`
 * `originalDrafts = item.parsed_records`). Best-effort: a standalone correction
 * (`inbound_message_id: null`, direct API write) or a pre-AI-09 message yields
 * `confidence: null`, not an error.
 */
async function fetchConfidenceRows(
	db: TenantDb,
	fromFilter: SQL,
	toFilter: SQL
): Promise<
	Array<{
		field: string;
		confidence: 'high' | 'medium' | 'low' | null;
		correction_count: number;
		distinct_messages: number;
	}>
> {
	const result = await db.execute(sql`
		WITH paired AS (
			SELECT
				c.id AS correction_id,
				c.inbound_message_id,
				orig.elem AS original,
				corr.elem AS corrected,
				pr.elem AS original_record
			FROM ai_corrections c
			CROSS JOIN LATERAL jsonb_array_elements(c.original_parsed)
				WITH ORDINALITY AS orig(elem, ord)
			CROSS JOIN LATERAL jsonb_array_elements(c.corrected)
				WITH ORDINALITY AS corr(elem, ord)
			LEFT JOIN inbound_messages im ON im.id = c.inbound_message_id
			LEFT JOIN LATERAL jsonb_array_elements(
				coalesce(im.payload -> 'parsed_records', '[]'::jsonb)
			) WITH ORDINALITY AS pr(elem, ord) ON pr.ord = orig.ord
			WHERE orig.ord = corr.ord
			${fromFilter}
			${toFilter}
		),
		diffs AS (
			SELECT
				correction_id,
				inbound_message_id,
				f.field,
				nullif(original_record -> 'evidence' -> f.field ->> 'confidence', '') AS confidence
			FROM paired
			CROSS JOIN LATERAL ( ${FIELD_DIFF_VALUES} ) AS f(field, differs)
			WHERE f.differs
		)
		SELECT
			field,
			confidence,
			count(*)::int AS correction_count,
			count(DISTINCT coalesce(inbound_message_id::text, correction_id::text))::int
				AS distinct_messages
		FROM diffs
		GROUP BY field, confidence
		ORDER BY field ASC, correction_count DESC
	`);

	return [...result].map((row) => ({
		field: String(row.field),
		confidence: (row.confidence as 'high' | 'medium' | 'low' | null) ?? null,
		correction_count: Number(row.correction_count),
		distinct_messages: Number(row.distinct_messages)
	}));
}

/**
 * GAP-F09-15 / AI-03 — field-level correction frequency + confidence breakdown,
 * scoped to an already tenant-set `db` (caller holds the `withTenant` transaction).
 * Exported so `AiAccuracyReportService` (AI-03 combined report) can compose it into
 * a single transaction instead of opening a second nested one.
 */
export async function computeAiCorrectionsFieldReport(
	db: TenantDb,
	params: AiCorrectionsReportParams
): Promise<{ items: AiCorrectionsReportRow[]; corrected_message_count: number }> {
	const fromFilter = params.from ? sql`AND c.created_at >= ${params.from}::date` : sql``;
	const toFilter = params.to
		? sql`AND c.created_at < (${params.to}::date + interval '1 day')`
		: sql``;

	// Sequential, not Promise.all: a tenant-scoped `db` may be a session-pinned
	// connection (test doubles) rather than a real transaction — concurrent queries
	// could hop to a different pool connection that never saw `set_config`. One
	// query at a time keeps this correct under both.
	const fieldResult = await db.execute(sql`
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
			CROSS JOIN LATERAL ( ${FIELD_DIFF_VALUES} ) AS f(field, differs)
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
	const confidenceRows = await fetchConfidenceRows(db, fromFilter, toFilter);
	const countResult = await db.execute(sql`
		SELECT count(DISTINCT coalesce(inbound_message_id::text, id::text))::int AS n
		FROM ai_corrections c
		WHERE true
		${fromFilter}
		${toFilter}
	`);

	const items: AiCorrectionsReportRow[] = [...fieldResult].map((row) => {
		const field = String(row.field);
		return {
			field,
			correction_count: Number(row.correction_count),
			distinct_messages: Number(row.distinct_messages),
			by_confidence: confidenceRows
				.filter((c) => c.field === field)
				.map((c) => ({
					confidence: c.confidence,
					correction_count: c.correction_count,
					distinct_messages: c.distinct_messages
				}))
		};
	});

	const corrected_message_count = Number([...countResult][0]?.n ?? 0);

	return { items, corrected_message_count };
}

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
	 * GAP-F09-15 / AI-03: field-level error frequency + confidence breakdown over the
	 * full period (no pagination). Thin wrapper around `computeAiCorrectionsFieldReport`.
	 */
	async report(tenantId: string, params: AiCorrectionsReportParams): Promise<AiCorrectionsReport> {
		return this.tenantContext.withTenant(tenantId, async ({ db }) => {
			const { items, corrected_message_count } = await computeAiCorrectionsFieldReport(
				db,
				params
			);
			return {
				period: { from: params.from ?? null, to: params.to ?? null },
				corrected_message_count,
				items
			};
		});
	}
}
