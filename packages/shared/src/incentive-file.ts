import { z } from 'zod';
import { cursorPageSchema, isoDate, isoDateTime, uuid } from './common.js';

/**
 * Incentive file (teşvik dosyası) — records only.
 * No eligibility / rate / limit logic; deadline days come from tenant settings.
 */

export const incentiveFileStatusSchema = z.enum([
	'open',
	'submitted',
	'approved',
	'rejected',
	'expired'
]);

export type IncentiveFileStatus = z.infer<typeof incentiveFileStatusSchema>;

export const INCENTIVE_DOCUMENT_LABEL_MAX = 120;
export const INCENTIVE_DOCUMENTS_MAX = 30;

export const incentiveDocumentItemSchema = z.object({
	key: z.string().trim().min(1).max(64),
	label: z.string().trim().min(1).max(INCENTIVE_DOCUMENT_LABEL_MAX),
	done: z.boolean()
});

export type IncentiveDocumentItem = z.infer<typeof incentiveDocumentItemSchema>;

export const incentiveDocumentsSchema = z
	.array(incentiveDocumentItemSchema)
	.max(INCENTIVE_DOCUMENTS_MAX)
	.superRefine((docs, ctx) => {
		const seen = new Set<string>();
		for (const [index, item] of docs.entries()) {
			if (seen.has(item.key)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Duplicate document key',
					path: [index, 'key']
				});
				return;
			}
			seen.add(item.key);
		}
	});

export type IncentiveDocuments = z.infer<typeof incentiveDocumentsSchema>;

/** Unique per-file document row key (UUID, 36 chars, within key max 64). */
export function newIncentiveDocumentKey(): string {
	return crypto.randomUUID();
}

/** Neutral checklist seed — labels are user-editable records, not legal advice. */
export const DEFAULT_INCENTIVE_DOCUMENTS: readonly IncentiveDocumentItem[] = [
	{ key: 'contract', label: 'Sözleşme', done: false },
	{ key: 'payment_proof', label: 'Ödeme belgesi', done: false },
	{ key: 'invoice', label: 'Fatura', done: false },
	{ key: 'id_document', label: 'Kimlik / pasaport', done: false },
	{ key: 'application_form', label: 'Başvuru formu', done: false },
	{ key: 'other', label: 'Diğer', done: false }
] as const;

export const incentiveFileSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	/** Display name denormalized for list views */
	contact_display_name: z.string().min(1).max(255),
	transaction_id: uuid.nullable(),
	payment_date: isoDate,
	deadline_at: isoDate,
	/** Calendar days from today to deadline_at (negative when past). */
	days_left: z.number().int(),
	status: incentiveFileStatusSchema,
	submitted_at: isoDate.nullable(),
	note: z.string().max(8000).nullable(),
	documents: incentiveDocumentsSchema,
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type IncentiveFile = z.infer<typeof incentiveFileSchema>;

export const incentiveFileCreateSchema = z
	.object({
		contact_id: uuid,
		payment_date: isoDate,
		transaction_id: uuid.nullable().optional(),
		note: z.string().max(8000).nullable().optional()
	})
	.strict();

export type IncentiveFileCreate = z.infer<typeof incentiveFileCreateSchema>;

export const incentiveFileUpdateSchema = z
	.object({
		status: incentiveFileStatusSchema.optional(),
		submitted_at: isoDate.nullable().optional(),
		note: z.string().max(8000).nullable().optional(),
		documents: incentiveDocumentsSchema.optional()
	})
	.strict();

export type IncentiveFileUpdate = z.infer<typeof incentiveFileUpdateSchema>;

export const incentiveFileListPageSchema = cursorPageSchema(incentiveFileSchema);

export type IncentiveFileListPage = z.infer<typeof incentiveFileListPageSchema>;

/** Add calendar days to a YYYY-MM-DD date (UTC noon arithmetic avoided — pure UTC date). */
export function addCalendarDays(isoDateStr: string, days: number): string {
	const d = new Date(`${isoDateStr}T00:00:00.000Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/** Difference in calendar days: `to - from` (YYYY-MM-DD). */
export function calendarDaysBetween(fromIso: string, toIso: string): number {
	const from = Date.parse(`${fromIso}T00:00:00.000Z`);
	const to = Date.parse(`${toIso}T00:00:00.000Z`);
	return Math.round((to - from) / 86_400_000);
}

/** UTC calendar date YYYY-MM-DD for “today” in deadline maths. */
export function utcTodayIsoDate(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}
