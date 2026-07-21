import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * Patient / appointment attachment metadata.
 * Binary lives in object storage (Faz 1); demo keeps metadata only.
 */
export const patientFileSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	patient_id: uuid,
	/** When set, file belongs to a visit; still listed under the patient. */
	appointment_id: uuid.nullable(),
	/** Optional denormalized label for list views */
	appointment_label: z.string().max(255).nullable().optional(),
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).default('application/octet-stream'),
	size_bytes: z.number().int().nonnegative(),
	uploaded_by_display_name: z.string().max(255).nullable().optional(),
	created_at: isoDateTime
});

export type PatientFile = z.infer<typeof patientFileSchema>;

export const patientFileCreateSchema = z.object({
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).optional(),
	size_bytes: z.number().int().nonnegative().optional(),
	appointment_id: uuid.nullable().optional()
});

export type PatientFileCreate = z.infer<typeof patientFileCreateSchema>;
