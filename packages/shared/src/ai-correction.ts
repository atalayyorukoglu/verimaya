import { z } from 'zod';
import { isoDate, isoDateTime, uuid } from './common.js';
import { transactionDraftSchema, type TransactionDraft } from './inbound-message.js';
import { reportPeriodSchema } from './reports.js';

/**
 * Human correction to an AI-parsed WhatsApp transaction draft (Faz 3 learning signal).
 * `original_parsed` is what the heuristic parser produced; `corrected` is what the
 * user actually saved. İnsan onayı olmadan kesin kayda yazılmaz (AGENTS.md) — this
 * table only records the diff for future prompt/parser tuning, it never mutates data.
 */
export const aiCorrectionCreateSchema = z.object({
	inbound_message_id: uuid.nullable().optional(),
	original_parsed: z.array(transactionDraftSchema).min(1),
	corrected: z.array(transactionDraftSchema).min(1)
});
export type AiCorrectionCreate = z.infer<typeof aiCorrectionCreateSchema>;

export const aiCorrectionSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	inbound_message_id: uuid.nullable(),
	original_parsed: z.array(transactionDraftSchema),
	corrected: z.array(transactionDraftSchema),
	created_by: z.string().nullable(),
	created_at: isoDateTime
});
export type AiCorrection = z.infer<typeof aiCorrectionSchema>;

/**
 * GAP-F09-15: field-level correction frequency report.
 *
 * Tracker stored one row per field (`field_name`/`ai_value`/`user_value`/`adet`).
 * Verimaya stores whole draft JSON pairs on `ai_corrections`, so the report expands
 * paired drafts and GROUP BYs by draft field key — answering "which fields does AI
 * get wrong most often?" without a schema migration. Value-triple grouping (Tracker
 * summary) is deferred: it needs resolved display names and is secondary to field
 * frequency for prompt tuning.
 *
 * Inclusive calendar-day `from`/`to` on `created_at` (UTC day bounds). Full period
 * (no cursor pagination). `.strict()` rejects unknown query keys.
 */
export const aiCorrectionsReportParamsSchema = z
	.object({
		from: isoDate.optional(),
		to: isoDate.optional()
	})
	.strict();
export type AiCorrectionsReportParams = z.infer<typeof aiCorrectionsReportParamsSchema>;

export const aiCorrectionsReportRowSchema = z.object({
	/** TransactionDraft key that differed (e.g. `category`, `amount`). */
	field: z.string().min(1),
	/** Times this field differed across draft pairs in scope. */
	correction_count: z.number().int().nonnegative(),
	/**
	 * Distinct source messages with ≥1 mismatch on this field.
	 * When `inbound_message_id` is null, the correction row id is the proxy.
	 */
	distinct_messages: z.number().int().nonnegative()
});
export type AiCorrectionsReportRow = z.infer<typeof aiCorrectionsReportRowSchema>;

export const aiCorrectionsReportSchema = z.object({
	period: reportPeriodSchema,
	items: z.array(aiCorrectionsReportRowSchema)
});
export type AiCorrectionsReport = z.infer<typeof aiCorrectionsReportSchema>;

/**
 * Draft keys compared when expanding a correction into field mismatches.
 * Keep in sync with the SQL VALUES list in AiCorrectionsService.report.
 */
export const AI_CORRECTION_COMPARE_FIELDS = [
	'kind',
	'amount',
	'currency',
	'counterparty_amount',
	'title',
	'category',
	'subcategory',
	'patient_id',
	'patient_display_name',
	'contact_label',
	'occurred_on',
	'payment_method',
	'description'
] as const satisfies ReadonlyArray<keyof TransactionDraft>;

export type AiCorrectionCompareField = (typeof AI_CORRECTION_COMPARE_FIELDS)[number];

function draftFieldKey(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return null;
	return String(value);
}

/** Field keys that differ between one original/corrected draft pair. */
export function differingDraftFields(
	original: TransactionDraft,
	corrected: TransactionDraft
): AiCorrectionCompareField[] {
	const out: AiCorrectionCompareField[] = [];
	for (const field of AI_CORRECTION_COMPARE_FIELDS) {
		if (draftFieldKey(original[field]) !== draftFieldKey(corrected[field])) {
			out.push(field);
		}
	}
	return out;
}

/**
 * Pure client/MSW aggregation mirroring the API report GROUP BY semantics.
 * Callers must already apply the from/to `created_at` window.
 */
export function aggregateAiCorrectionsReport(items: AiCorrection[]): AiCorrectionsReportRow[] {
	const byField = new Map<string, { correction_count: number; messages: Set<string> }>();

	for (const item of items) {
		const messageKey = item.inbound_message_id ?? item.id;
		const len = Math.min(item.original_parsed.length, item.corrected.length);
		for (let i = 0; i < len; i++) {
			const original = item.original_parsed[i]!;
			const corrected = item.corrected[i]!;
			for (const field of differingDraftFields(original, corrected)) {
				let bucket = byField.get(field);
				if (!bucket) {
					bucket = { correction_count: 0, messages: new Set() };
					byField.set(field, bucket);
				}
				bucket.correction_count += 1;
				bucket.messages.add(messageKey);
			}
		}
	}

	return [...byField.entries()]
		.map(([field, bucket]) => ({
			field,
			correction_count: bucket.correction_count,
			distinct_messages: bucket.messages.size
		}))
		.sort((a, b) => b.correction_count - a.correction_count || a.field.localeCompare(b.field));
}
