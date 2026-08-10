import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

export const contactFileStatusSchema = z.enum(['pending', 'ready']);
export type ContactFileStatus = z.infer<typeof contactFileStatusSchema>;

/**
 * AUDIT-F09-08 / GAP-F09-24: MIME allowlist for new contact file uploads and
 * safe inline preview. Aligned with Fastify binary content-type parsers
 * (pdf/png/jpeg/webp); `image/jpg` is normalized to `image/jpeg`.
 */
export const CONTACT_FILE_ALLOWED_MIME_TYPES = [
	'application/pdf',
	'image/png',
	'image/jpeg',
	'image/webp'
] as const;

export type ContactFileAllowedMimeType = (typeof CONTACT_FILE_ALLOWED_MIME_TYPES)[number];

/** Strip parameters (`image/jpeg; charset=…`) and alias `image/jpg` → `image/jpeg`. */
export function normalizeContactFileMimeType(raw: string): string {
	const base = raw.split(';')[0]?.trim().toLowerCase() ?? '';
	if (base === 'image/jpg') return 'image/jpeg';
	return base;
}

export function isAllowedContactFileMimeType(
	mime: string
): mime is ContactFileAllowedMimeType {
	const normalized = normalizeContactFileMimeType(mime);
	return (CONTACT_FILE_ALLOWED_MIME_TYPES as readonly string[]).includes(normalized);
}

/** GAP-F09-24: same set as upload allowlist — safe for `Content-Disposition: inline`. */
export function isInlineSafeContactFileMimeType(mime: string): boolean {
	return isAllowedContactFileMimeType(mime);
}

/**
 * Contact / appointment attachment metadata.
 * Binary lives in object storage (`local://…` or `s3://…`).
 * Presign → client PUT → confirm; `pending` until confirm.
 */
export const contactFileSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	/** When set, file belongs to a visit; still listed under the contact. */
	appointment_id: uuid.nullable(),
	/** Optional denormalized label for list views */
	appointment_label: z.string().max(255).nullable().optional(),
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).default('application/octet-stream'),
	size_bytes: z.number().int().nonnegative(),
	status: contactFileStatusSchema.default('ready'),
	uploaded_by_display_name: z.string().max(255).nullable().optional(),
	created_at: isoDateTime
});

export type ContactFile = z.infer<typeof contactFileSchema>;

export const contactFileCreateSchema = z.object({
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).optional(),
	size_bytes: z.number().int().nonnegative().optional(),
	appointment_id: uuid.nullable().optional()
});

export type ContactFileCreate = z.infer<typeof contactFileCreateSchema>;

/** Start a direct-to-storage upload (presigned PUT or API content PUT). */
export const contactFilePresignSchema = z.object({
	filename: z.string().min(1).max(512),
	mime_type: z.string().max(256).default('application/octet-stream'),
	size_bytes: z
		.number()
		.int()
		.positive()
		.max(25 * 1024 * 1024),
	appointment_id: uuid.nullable().optional()
});

export type ContactFilePresign = z.infer<typeof contactFilePresignSchema>;

export const contactFilePresignResponseSchema = z.object({
	file_id: uuid,
	upload_url: z.string().url(),
	storage_key: z.string().min(1),
	/** Seconds the upload_url is valid (S3); local content URL ignores expiry. */
	expires_in: z.number().int().positive()
});

export type ContactFilePresignResponse = z.infer<typeof contactFilePresignResponseSchema>;
