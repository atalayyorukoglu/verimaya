import { z } from 'zod';
import { appointmentStatusSchema } from './appointment.js';
import { cursorPageParams, isoDate, searchableListParams, uuid } from './common.js';
import { transactionKindSchema, transactionStatusSchema } from './transaction.js';

/**
 * CONTRACT-01 (Faz 2.1): per-endpoint list query schemas.
 *
 * These are the single source of truth for which filters an endpoint accepts.
 * API controllers, the web API client, and MSW handlers must all validate against
 * (or build URLs from) these shapes — no endpoint may silently ignore a filter the
 * web/MSW send, and no unknown query parameter may be silently ignored (`.strict()`
 * rejects it, callers should turn that into an HTTP 400).
 *
 * Date-range semantics (`from`/`to`) are **inclusive** calendar days (YYYY-MM-DD):
 * - `transactions.from`/`to` filter the naive `occurred_on` date column (string
 *   comparison is correct — no timezone conversion).
 * - `appointments.from`/`to` are tenant-timezone calendar days; the API converts
 *   each to UTC `[start, endExclusive)` bounds on `starts_at` (TIME-01).
 */

/** GAP-04 (G-05): status (exact) + q (patient name / notes / clinic / hotel). */
export const appointmentListQuerySchema = cursorPageParams
	.extend({
		patient_id: uuid.optional(),
		from: isoDate.optional(),
		to: isoDate.optional(),
		status: appointmentStatusSchema.optional(),
		q: z.string().trim().min(1).max(255).optional()
	})
	.strict();

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

/** GAP-03 (G-01): pilot filter set — kind / status / category (exact) / q (substring). */
export const transactionListQuerySchema = cursorPageParams
	.extend({
		patient_id: uuid.optional(),
		contact_id: uuid.optional(),
		from: isoDate.optional(),
		to: isoDate.optional(),
		kind: transactionKindSchema.optional(),
		status: transactionStatusSchema.optional(),
		category: z.string().trim().min(1).max(128).optional(),
		q: z.string().trim().min(1).max(255).optional()
	})
	.strict();

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

export const contactListQuerySchema = searchableListParams
	.extend({
		type_id: uuid.optional()
	})
	.strict();

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const patientListQuerySchema = searchableListParams.strict();

export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

/**
 * CONTRACT-02 (Faz 2.2): the ordering every list endpoint uses unless documented
 * otherwise — newest first (`created_at` desc), `id` desc as a tiebreaker for rows
 * with an identical timestamp. This must match exactly between the API (cursor
 * pagination is built on this order) and MSW (previously used ad-hoc per-resource
 * orderings — display_name, occurred_on, starts_at — that silently diverged from
 * the real API; that was a real MSW/API contract bug, not a stylistic choice).
 *
 * Exception — `GET /v1/transactions`: business date order
 * (`occurred_on` desc, `id` desc). See `compareByOccurredOnDesc`.
 */
export function compareByCreatedAtDesc<T extends { created_at: string; id: string }>(
	a: T,
	b: T
): number {
	return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/** Transactions list order / MSW parity (`occurred_on DESC, id DESC`). */
export function compareByOccurredOnDesc<T extends { occurred_on: string; id: string }>(
	a: T,
	b: T
): number {
	return b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id);
}
