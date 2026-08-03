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
 * Date-range semantics (`from`/`to`) are **inclusive**. Until Faz 3.3 (TIME-01) lands
 * tenant-timezone-aware calendar-day helpers, ranges are interpreted as-is:
 * - `transactions.from`/`to` filter the naive `occurred_on` date column (already a
 *   calendar day, no timezone conversion needed — string comparison is correct).
 * - `appointments.from`/`to` filter the `starts_at` timestamptz column as raw UTC
 *   instants (the web client already sends `Date#toISOString()` of the browser's
 *   local day boundary, so this is correct today; Faz 3.3 will make the tenant
 *   timezone explicit instead of relying on the browser's local clock).
 */

export const appointmentListQuerySchema = cursorPageParams
	.extend({
		patient_id: uuid.optional(),
		from: z.string().datetime().optional(),
		to: z.string().datetime().optional()
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
