import { z } from 'zod';
import { contactListSortKeys } from './contact-list-sort.js';
import { appointmentStatusSchema } from './appointment.js';
import { cursorPageParams, isoDate, searchableListParams, uuid } from './common.js';
import { commissionEntryStatusSchema } from './commission.js';
import { incentiveFileStatusSchema } from './incentive-file.js';
import { operationAlertStatusSchema } from './operation-alert.js';
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

/**
 * GAP-04 (G-05) + G-05r: status/q + `contact_involves` (any role FK:
 * patient / clinic / hotel / transfer).
 */
export const appointmentListQuerySchema = cursorPageParams
	.extend({
		contact_id: uuid.optional(),
		/** Match appointments where this contact appears in any role FK. */
		contact_involves: uuid.optional(),
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
		contact_id: uuid.optional(),
		case_contact_id: uuid.optional(),
		from: isoDate.optional(),
		to: isoDate.optional(),
		kind: transactionKindSchema.optional(),
		status: transactionStatusSchema.optional(),
		category: z.string().trim().min(1).max(128).optional(),
		q: z.string().trim().min(1).max(255).optional()
	})
	.strict();

export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>;

/**
 * Incentive files: default order is deadline urgency (`deadline_at ASC, id ASC`).
 * `due_within_days` keeps rows where `deadline_at <= today + N` (includes overdue).
 */
export const incentiveFileListQuerySchema = cursorPageParams
	.extend({
		status: incentiveFileStatusSchema.optional(),
		due_within_days: z.coerce.number().int().min(0).max(3650).optional()
	})
	.strict();

export type IncentiveFileListQuery = z.infer<typeof incentiveFileListQuerySchema>;

/**
 * Commission entries: default order is earned date (`earned_on DESC, id DESC`).
 * `from`/`to` filter inclusive calendar days on `earned_on`.
 */
export const commissionEntryListQuerySchema = cursorPageParams
	.extend({
		beneficiary_contact_id: uuid.optional(),
		status: commissionEntryStatusSchema.optional(),
		from: isoDate.optional(),
		to: isoDate.optional()
	})
	.strict();

export type CommissionEntryListQuery = z.infer<typeof commissionEntryListQuerySchema>;

/**
 * Operation alerts: default order is urgency (`due_at ASC, id ASC`).
 * `within_hours` keeps rows where `due_at <= now + N` (includes overdue).
 */
export const operationAlertListQuerySchema = cursorPageParams
	.extend({
		status: operationAlertStatusSchema.optional(),
		within_hours: z.coerce.number().int().min(0).max(8760).optional()
	})
	.strict();

export type OperationAlertListQuery = z.infer<typeof operationAlertListQuerySchema>;

export const contactListQuerySchema = searchableListParams
	.extend({
		type_id: uuid.optional()
	})
	.strict();

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

/**
 * CONTRACT-02 (Faz 2.2): the ordering every list endpoint uses unless documented
 * otherwise — newest first (`created_at` desc), `id` desc as a tiebreaker for rows
 * with an identical timestamp. This must match exactly between the API (cursor
 * pagination is built on this order) and MSW (previously used ad-hoc per-resource
 * orderings — display_name, occurred_on, starts_at — that silently diverged from
 * the real API; that was a real MSW/API contract bug, not a stylistic choice).
 *
 * Exceptions:
 * - `GET /v1/transactions`: business date order (`occurred_on` desc, `id` desc).
 *   See `compareByOccurredOnDesc`.
 * - `GET /v1/incentives`: urgency order (`deadline_at` asc, `id` asc).
 *   See `compareByDeadlineAtAsc`.
 * - `GET /v1/commissions`: earned date order (`earned_on` desc, `id` desc).
 *   See `compareByEarnedOnDesc`.
 * - `GET /v1/operation-alerts`: urgency order (`due_at` asc, `id` asc).
 *   See `compareByDueAtAsc`.
 * - `GET /v1/contacts`: phonebook order (`last_name` asc nulls last, `first_name`
 *   asc nulls last, `id` asc). Display stays Ad Soyad (`display_name`); only the
 *   list order is by surname. See `compareByLastNameAsc`.
 */
export function compareByCreatedAtDesc<T extends { created_at: string; id: string }>(
	a: T,
	b: T
): number {
	return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/** Duplicate-scan order / MSW parity (`created_at ASC, id ASC`). */
export function compareByCreatedAtAsc<T extends { created_at: string; id: string }>(
	a: T,
	b: T
): number {
	return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
}

/** Transactions list order / MSW parity (`occurred_on DESC, id DESC`). */
export function compareByOccurredOnDesc<T extends { occurred_on: string; id: string }>(
	a: T,
	b: T
): number {
	return b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id);
}

/** Incentive files list order / MSW parity (`deadline_at ASC, id ASC`). */
export function compareByDeadlineAtAsc<T extends { deadline_at: string; id: string }>(
	a: T,
	b: T
): number {
	return a.deadline_at.localeCompare(b.deadline_at) || a.id.localeCompare(b.id);
}

/** Commission entries list order / MSW parity (`earned_on DESC, id DESC`). */
export function compareByEarnedOnDesc<T extends { earned_on: string; id: string }>(
	a: T,
	b: T
): number {
	return b.earned_on.localeCompare(a.earned_on) || b.id.localeCompare(a.id);
}

/** Operation alerts list order / MSW parity (`due_at ASC, id ASC`). */
export function compareByDueAtAsc<T extends { due_at: string; id: string }>(
	a: T,
	b: T
): number {
	return a.due_at.localeCompare(b.due_at) || a.id.localeCompare(b.id);
}

/** Nullable text ASC with NULLS LAST (PostgreSQL ASC default is NULLS FIRST — do not rely on it). */
function compareNullableTextAsc(a: string | null, b: string | null): number {
	if (a === b) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/** Contacts list order / MSW parity (phonebook keys ASC NULLS LAST, id ASC). */
export function compareByLastNameAsc<
	T extends {
		last_name: string | null;
		first_name: string;
		display_name: string;
		contact_type_name: string;
		id: string;
	}
>(a: T, b: T): number {
	const ka = contactListSortKeys(a);
	const kb = contactListSortKeys(b);
	return (
		compareNullableTextAsc(ka.sortLastName, kb.sortLastName) ||
		compareNullableTextAsc(ka.sortFirstName, kb.sortFirstName) ||
		(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
}
