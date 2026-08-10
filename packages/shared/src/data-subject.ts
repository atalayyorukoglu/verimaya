import { z } from 'zod';
import { auditLogSchema } from './audit.js';
import { isoDateTime, uuid } from './common.js';
import { userRoleSchema } from './user.js';

/**
 * AUDIT-F09-07 — KVKK m.11 data-subject surfaces under `/v1/me/*`.
 * Scope: panel user (better-auth) in the active org — not contact/patient rows.
 */

export const dataDeletionRequestStatusSchema = z.enum(['received', 'applied']);
export type DataDeletionRequestStatus = z.infer<typeof dataDeletionRequestStatusSchema>;

export const dataDeletionRequestSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	subject_user_id: uuid,
	status: dataDeletionRequestStatusSchema,
	/** When status=applied: identifying fields on the user row were masked. */
	anonymized_at: isoDateTime.nullable(),
	created_at: isoDateTime
});
export type DataDeletionRequest = z.infer<typeof dataDeletionRequestSchema>;

export const dataExportSubjectSchema = z.object({
	id: uuid,
	email: z.string().email().max(255),
	display_name: z.string().min(1).max(255),
	role: userRoleSchema,
	created_at: isoDateTime,
	membership_created_at: isoDateTime
});
export type DataExportSubject = z.infer<typeof dataExportSubjectSchema>;

export const dataExportSchema = z.object({
	exported_at: isoDateTime,
	tenant_id: uuid,
	data_retention_until: isoDateTime.nullable(),
	subject: dataExportSubjectSchema,
	/** Audit rows in this tenant where the subject was the actor — not other members'. */
	audit_logs_as_actor: z.array(auditLogSchema),
	deletion_requests: z.array(dataDeletionRequestSchema)
});
export type DataExport = z.infer<typeof dataExportSchema>;
