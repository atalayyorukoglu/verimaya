import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const patientFileStatusSchema = z.enum(['pending', 'ready']);
export type PatientFileStatus = z.infer<typeof patientFileStatusSchema>;

/**
 * AUDIT-F09-08 / GAP-F09-24: MIME allowlist for new patient file uploads and
 * safe inline preview. Aligned with Fastify binary content-type parsers
 * (pdf/png/jpeg/webp); `image/jpg` is normalized to `image/jpeg`.
 */
export const PATIENT_FILE_ALLOWED_MIME_TYPES = [
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/webp'
] as const;

export type PatientFileAllowedMimeType = (typeof PATIENT_FILE_ALLOWED_MIME_TYPES)[number];

/** Strip parameters (`image/jpeg; charset=…`) and alias `image/jpg` → `image/jpeg`. */
export function normalizePatientFileMimeType(raw: string): string {
	const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
	if (base === 'image/jpg') return 'image/jpeg';
	return base;
}

export function isAllowedPatientFileMimeType(
	mime: string
): mime is PatientFileAllowedMimeType {
	const normalized = normalizePatientFileMimeType(mime);
	return (PATIENT_FILE_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized);
}

/** GAP-F09-24: same set as upload allowlist — safe for `Content-Disposition: inline`. */
export function isInlineSafePatientFileMimeType(mime: string): boolean {
	return isAllowedPatientFileMimeType(mime);
}

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
