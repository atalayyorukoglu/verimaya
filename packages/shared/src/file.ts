import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const patientFileStatusSchema = z.enum(['pending', 'ready']);
export type PatientFileStatus = z.infer<typeof patientFileStatusSchema>;

/**
 * Patient / appointment attachment metadata.
 * Binary lives in object storage (`local://…` or `s3://…`).
 * Presign → client PUT → confirm; `pending` until confirm.
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
	status: patientFileStatusSchema.default('ready'),
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

/** Start a direct-to-storage upload (presigned PUT or API content PUT). */
export const patientFilePresignSchema = z.object({
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).default('application/octet-stream'),
	size_bytes: z
		.number()
		.int()
		.positive()
		.max(25 * 1024 * 1024),
	appointment_id: uuid.nullable().optional()
});

export type PatientFilePresign = z.infer<typeof patientFilePresignSchema>;

export const patientFilePresignResponseSchema = z.object({
	file_id: uuid,
	upload_url: z.string().url(),
	storage_key: z.string().min(1),
	/** Seconds the upload_url is valid (S3); local content URL ignores expiry. */
	expires_in: z.number().int().positive()
});

export type PatientFilePresignResponse = z.infer<typeof patientFilePresignResponseSchema>;
