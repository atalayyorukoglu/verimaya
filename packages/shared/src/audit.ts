import { z } from 'zod';
import { cursorPageParams, isoDate, isoDateTime, uuid } from './common.js';

export const auditActionSchema = z.enum(['create', 'update', 'delete', 'login']);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEntitySchema = z.enum([
	'contact',
	'appointment',
	'transaction',
	'inbound_message',
	'file',
	'tenant',
	'user'
]);
export type AuditEntity = z.infer<typeof auditEntitySchema>;

export const auditLogSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	actor_id: uuid.nullable(),
	actor_display_name: z.string().max(255),
	action: auditActionSchema,
	entity_type: auditEntitySchema,
	/** Human-readable target, e.g. contact name or transaction title */
	entity_label: z.string().max(255).nullable(),
	created_at: isoDateTime
});

export type AuditLog = z.infer<typeof auditLogSchema>;

/**
 * GAP-F09-13 (G-13): audit list filters.
 *
 * - `created_from` / `created_to` are inclusive tenant-timezone calendar days
 *   (YYYY-MM-DD); the API converts each to UTC `[start, endExclusive)` on `created_at`
 *   via `tenantDayRange` (same semantics as appointments `from`/`to`).
 * - Tracker offered `entity_id`; Verimaya’s `audit_logs` table has no `entity_id`
 *   column (only `entity_label`), so `q` is a case-insensitive substring on `entity_label`.
 */
export const auditLogListQuerySchema = cursorPageParams
	.extend({
		actor_id: uuid.optional(),
		action: auditActionSchema.optional(),
		entity_type: auditEntitySchema.optional(),
		created_from: isoDate.optional(),
		created_to: isoDate.optional(),
		q: z.string().trim().min(1).max(255).optional()
	})
	.strict();

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>;
