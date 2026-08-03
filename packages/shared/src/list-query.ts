import { z } from 'zod';
import { cursorPageParams, isoDate, searchableListParams, uuid } from './common.js';

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

export const appointmentListQuerySchema = cursorPageParams
	.extend({
		patient_id: uuid.optional(),
		from: isoDate.optional(),
		to: isoDate.optional()
	})
	.strict();

export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const transactionListQuerySchema = cursorPageParams
	.extend({
		patient_id: uuid.optional(),
		contact_id: uuid.optional(),
		from: isoDate.optional(),
		to: isoDate.optional()
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
 */
export function compareByCreatedAtDesc<T extends { created_at: string; id: string }>(
	a: T,
	b: T
): number {
	return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}
