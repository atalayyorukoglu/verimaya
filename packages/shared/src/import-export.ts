import { z } from 'zod';
import { isoDateTime } from './common.js';
import { contactCreateSchema, contactStatusSchema } from './contact.js';

/**
 * G-10 / G-09 — Excel içe/dışa aktarım sınırları.
 *
 * `IMPORT_MAX_UPLOAD_BYTES` (5 MiB): xlsx zip bomb / bellek DoS’a karşı;
 * panel dosya yüklemesi 25 MiB’ye kadar çıkabilir ama satır tablosu çok daha
 * yoğundur — 5 MiB ~ binlerce satır için fazlasıyla yeter, üstü şüpheli.
 *
 * `IMPORT_MAX_ROWS` (2000): ikinci müşteri migrasyonu için yeterli; tek
 * transaction süresi ve dry-run bellek üst sınırını tutar. Aşımı 400 ile reddet.
 *
 * `IMPORT_PLAN_TTL_MS` (30 dk): dry-run → commit penceresi; süresi dolmuş
 * plan_token commit edilemez.
 */
export const IMPORT_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_PLAN_TTL_MS = 30 * 60 * 1000;

/**
 * `external_ids.source` for spreadsheet imports — distinct from
 * `legacy_tracker` (ETL) and CRM providers (ghl, …).
 */
export const IMPORT_EXTERNAL_SOURCE = 'xlsx_import' as const;

/** Contact sheet canonical headers (machine keys = API field names). */
export const CONTACT_IMPORT_HEADERS = [
	'external_id',
	'id',
	'contact_type',
	'first_name',
	'last_name',
	'phone',
	'email',
	'notes',
	'organization',
	'status',
	'source',
	'medium',
	'campaign',
	'is_internal'
] as const;

export type ContactImportHeader = (typeof CONTACT_IMPORT_HEADERS)[number];

/**
 * Optional Turkish / legacy aliases → canonical header.
 * Unknown columns are ignored (never errors).
 */
export const CONTACT_IMPORT_HEADER_ALIASES: Record<string, ContactImportHeader> = {
	'kişi id': 'id',
	'kisi id': 'id',
	'contact id': 'id',
	ad: 'first_name',
	'first name': 'first_name',
	soyad: 'last_name',
	'last name': 'last_name',
	telefon: 'phone',
	'e-posta': 'email',
	eposta: 'email',
	'e posta': 'email',
	notlar: 'notes',
	'hasta notu': 'notes',
	'iletişim türü': 'contact_type',
	'iletisim turu': 'contact_type',
	'party type': 'contact_type',
	işletme: 'organization',
	isletme: 'organization',
	firma: 'organization',
	kaynak: 'source',
	ortam: 'medium',
	kampanya: 'campaign',
	'dahili mi': 'is_internal',
	internal: 'is_internal',
	durum: 'status'
};

export const importRowActionSchema = z.enum(['create', 'update', 'unchanged', 'error']);
export type ImportRowAction = z.infer<typeof importRowActionSchema>;

export const importDryRunRowSchema = z.object({
	row_number: z.number().int().positive(),
	action: importRowActionSchema,
	external_id: z.string().max(255).nullable(),
	label: z.string().max(255).nullable(),
	errors: z.array(z.string().max(500)).default([])
});
export type ImportDryRunRow = z.infer<typeof importDryRunRowSchema>;

export const importDryRunSummarySchema = z.object({
	total_rows: z.number().int().nonnegative(),
	create: z.number().int().nonnegative(),
	update: z.number().int().nonnegative(),
	unchanged: z.number().int().nonnegative(),
	error: z.number().int().nonnegative()
});
export type ImportDryRunSummary = z.infer<typeof importDryRunSummarySchema>;

export const importDryRunResultSchema = z.object({
	/** Opaque encrypted plan — required by commit. Empty when error > 0. */
	plan_token: z.string().nullable(),
	expires_at: isoDateTime.nullable(),
	summary: importDryRunSummarySchema,
	/** Preview rows (errors first, then create/update); capped server-side. */
	rows: z.array(importDryRunRowSchema)
});
export type ImportDryRunResult = z.infer<typeof importDryRunResultSchema>;

export const importCommitBodySchema = z
	.object({
		plan_token: z.string().min(1).max(2_000_000)
	})
	.strict();
export type ImportCommitBody = z.infer<typeof importCommitBodySchema>;

export const importCommitResultSchema = z.object({
	created: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	unchanged: z.number().int().nonnegative()
});
export type ImportCommitResult = z.infer<typeof importCommitResultSchema>;

/**
 * Validated contact row payload stored inside the encrypted plan.
 * `external_id` is always set (caller-supplied or content hash).
 */
export const contactImportPlanRowSchema = z.object({
	row_number: z.number().int().positive(),
	action: z.enum(['create', 'update', 'unchanged']),
	external_id: z.string().min(1).max(255),
	/** Existing contact UUID when action is update/unchanged */
	contact_id: z.string().uuid().nullable(),
	fields: contactCreateSchema.extend({
		status: contactStatusSchema.nullable().optional()
	})
});
export type ContactImportPlanRow = z.infer<typeof contactImportPlanRowSchema>;

export const contactImportPlanSchema = z.object({
	v: z.literal(1),
	kind: z.literal('contacts'),
	tenant_id: z.string().uuid(),
	exp: z.number().int().positive(),
	rows: z.array(contactImportPlanRowSchema).max(IMPORT_MAX_ROWS)
});
export type ContactImportPlan = z.infer<typeof contactImportPlanSchema>;

/** XLSX binary download marker for OpenAPI (actual body is the file bytes). */
export const xlsxDownloadSchema = z.unknown();
