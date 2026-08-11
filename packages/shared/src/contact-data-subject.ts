import { z } from 'zod';
import { appointmentSchema } from './appointment.js';
import { contactCaseNoteSchema } from './case-note.js';
import { isoDateTime, uuid } from './common.js';
import { contactFinanceSummarySchema, contactSchema } from './contact.js';
import { dataDeletionRequestStatusSchema } from './data-subject.js';
import { contactFileSchema } from './file.js';

/**
 * AUDIT-F09-07b — KVKK m.11 data-subject surfaces under `/v1/contacts/:id/*`.
 * Subject is a contact row (no panel login); operator/admin performs the action.
 */

export const contactDataDeletionRequestSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	subject_contact_id: uuid,
	status: dataDeletionRequestStatusSchema,
	/** When status=applied: identifying fields on the contact row were masked. */
	anonymized_at: isoDateTime.nullable(),
	created_at: isoDateTime
});
export type ContactDataDeletionRequest = z.infer<typeof contactDataDeletionRequestSchema>;

/**
 * Machine-readable export of tenant-scoped personal data for one contact.
 * Finance is a summary only — transaction rows stay in the ledger (not dumped here).
 * File entries are metadata only (no blob bytes / storage keys).
 */
export const contactDataExportSchema = z.object({
	exported_at: isoDateTime,
	tenant_id: uuid,
	data_retention_until: isoDateTime.nullable(),
	contact: contactSchema,
	case_notes: z.array(contactCaseNoteSchema),
	appointments: z.array(appointmentSchema),
	files: z.array(contactFileSchema),
	finance_summary: contactFinanceSummarySchema,
	deletion_requests: z.array(contactDataDeletionRequestSchema)
});
export type ContactDataExport = z.infer<typeof contactDataExportSchema>;
