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

/** Bundle workbook sheets (G-09). */
export const bundleSheetSchema = z.enum(['cases', 'appointments', 'transactions']);
export type BundleSheet = z.infer<typeof bundleSheetSchema>;

export const CASE_IMPORT_HEADERS = [
	'external_id',
	'id',
	'first_name',
	'last_name',
	'phone',
	'email',
	'notes',
	'status',
	'source',
	'medium',
	'campaign'
] as const;

export const CASE_IMPORT_HEADER_ALIASES: Record<string, (typeof CASE_IMPORT_HEADERS)[number]> = {
	'kişi id': 'id',
	'kisi id': 'id',
	'hasta id': 'id',
	'patient id': 'id',
	'contact id': 'id',
	ad: 'first_name',
	'first name': 'first_name',
	'full name': 'first_name',
	soyad: 'last_name',
	'last name': 'last_name',
	telefon: 'phone',
	'e-posta': 'email',
	eposta: 'email',
	notlar: 'notes',
	'hasta notu': 'notes',
	kaynak: 'source',
	ortam: 'medium',
	kampanya: 'campaign',
	durum: 'status'
};

export const APPOINTMENT_IMPORT_HEADERS = [
	'external_id',
	'id',
	'contact_external_id',
	'contact_id',
	'contact_email',
	'title',
	'appointment_type',
	'status',
	'starts_at',
	'ends_at',
	'clinic_name',
	'hotel_name',
	'transfer_note',
	'clinic_contact_external_id',
	'hotel_contact_external_id',
	'transfer_contact_external_id',
	'notes'
] as const;

export const APPOINTMENT_IMPORT_HEADER_ALIASES: Record<
	string,
	(typeof APPOINTMENT_IMPORT_HEADERS)[number]
> = {
	hasta: 'contact_external_id',
	'contact id': 'contact_id',
	tür: 'appointment_type',
	tur: 'appointment_type',
	durum: 'status',
	geliş: 'starts_at',
	gelis: 'starts_at',
	dönüş: 'ends_at',
	donus: 'ends_at',
	klinik: 'clinic_name',
	otel: 'hotel_name',
	transfer: 'transfer_note',
	notlar: 'notes'
};

export const TRANSACTION_IMPORT_HEADERS = [
	'external_id',
	'id',
	'kind',
	'title',
	'category',
	'subtitle',
	'occurred_on',
	'status',
	'invoice_status',
	'payment_method',
	'amount',
	'paid_amount',
	'currency',
	'amount_base',
	'fx_rate',
	'fx_dated',
	'contact_external_id',
	'contact_id',
	'contact_label',
	'case_contact_external_id',
	'case_contact_id',
	'responsible_contact_external_id',
	'responsible_contact_id',
	'description'
] as const;

export const TRANSACTION_IMPORT_HEADER_ALIASES: Record<
	string,
	(typeof TRANSACTION_IMPORT_HEADERS)[number]
> = {
	tarih: 'occurred_on',
	tip: 'kind',
	kategori: 'category',
	'alt kategori': 'subtitle',
	tutar: 'amount',
	'para birimi': 'currency',
	yöntem: 'payment_method',
	yontem: 'payment_method',
	'ödeme durumu': 'status',
	'odeme durumu': 'status',
	ödenen: 'paid_amount',
	odenen: 'paid_amount',
	hasta: 'case_contact_external_id',
	sorumlu: 'responsible_contact_external_id',
	açıklama: 'description',
	aciklama: 'description',
	'fatura durumu': 'invoice_status'
};

export const importBundleDryRunRowSchema = importDryRunRowSchema.extend({
	sheet: bundleSheetSchema
});
export type ImportBundleDryRunRow = z.infer<typeof importBundleDryRunRowSchema>;

export const importBundleDryRunResultSchema = z.object({
	plan_token: z.string().nullable(),
	expires_at: isoDateTime.nullable(),
	summary: importDryRunSummarySchema,
	sheets: z.object({
		cases: importDryRunSummarySchema.optional(),
		appointments: importDryRunSummarySchema.optional(),
		transactions: importDryRunSummarySchema.optional()
	}),
	rows: z.array(importBundleDryRunRowSchema)
});
export type ImportBundleDryRunResult = z.infer<typeof importBundleDryRunResultSchema>;

export const importBundleCommitResultSchema = z.object({
	cases: importCommitResultSchema,
	appointments: importCommitResultSchema,
	transactions: importCommitResultSchema
});
export type ImportBundleCommitResult = z.infer<typeof importBundleCommitResultSchema>;

export const appointmentImportPlanRowSchema = z.object({
	row_number: z.number().int().positive(),
	action: z.enum(['create', 'update', 'unchanged']),
	external_id: z.string().min(1).max(255),
	appointment_id: z.string().uuid().nullable(),
	contact_ref: z.object({
		kind: z.enum(['id', 'external_id']),
		value: z.string().min(1).max(255)
	}),
	clinic_contact_external_id: z.string().max(255).nullable(),
	hotel_contact_external_id: z.string().max(255).nullable(),
	transfer_contact_external_id: z.string().max(255).nullable(),
	fields: z.object({
		title: z.string().max(255).nullable(),
		appointment_type: z.string().max(128).nullable(),
		status: z.enum([
			'scheduled',
			'confirmed',
			'in_progress',
			'completed',
			'cancelled',
			'no_show'
		]),
		starts_at: z.string().min(1),
		ends_at: z.string().nullable(),
		clinic_name: z.string().max(255).nullable(),
		hotel_name: z.string().max(255).nullable(),
		transfer_note: z.string().max(8000).nullable(),
		notes: z.string().max(8000).nullable()
	})
});
export type AppointmentImportPlanRow = z.infer<typeof appointmentImportPlanRowSchema>;

export const transactionImportPlanRowSchema = z.object({
	row_number: z.number().int().positive(),
	action: z.enum(['create', 'update', 'unchanged']),
	external_id: z.string().min(1).max(255),
	transaction_id: z.string().uuid().nullable(),
	contact_ref: z
		.object({
			kind: z.enum(['id', 'external_id', 'label']),
			value: z.string().min(1).max(255)
		})
		.nullable(),
	case_contact_ref: z
		.object({
			kind: z.enum(['id', 'external_id']),
			value: z.string().min(1).max(255)
		})
		.nullable(),
	responsible_contact_ref: z
		.object({
			kind: z.enum(['id', 'external_id']),
			value: z.string().min(1).max(255)
		})
		.nullable(),
	fields: z.object({
		kind: z.enum(['income', 'expense']),
		title: z.string().max(255).nullable(),
		subtitle: z.string().max(255).nullable(),
		category: z.string().max(128).nullable(),
		occurred_on: z.string().min(1),
		status: z.enum(['paid', 'partial', 'unpaid']),
		invoice_status: z.enum(['none', 'issued', 'not_issued']),
		payment_method: z.string().max(64).nullable(),
		amount: z.number().int().positive(),
		paid_amount: z.number().int().nonnegative().nullable(),
		currency: z.enum(['TRY', 'GBP', 'EUR', 'USD']),
		amount_base: z.number().int().nonnegative().nullable(),
		fx_rate: z.number().positive().nullable(),
		fx_dated: z.string().nullable(),
		description: z.string().max(8000).nullable()
	})
});
export type TransactionImportPlanRow = z.infer<typeof transactionImportPlanRowSchema>;

export const bundleImportPlanSchema = z.object({
	v: z.literal(1),
	kind: z.literal('bundle'),
	tenant_id: z.string().uuid(),
	exp: z.number().int().positive(),
	cases: z.array(contactImportPlanRowSchema).max(IMPORT_MAX_ROWS),
	appointments: z.array(appointmentImportPlanRowSchema).max(IMPORT_MAX_ROWS),
	transactions: z.array(transactionImportPlanRowSchema).max(IMPORT_MAX_ROWS)
});
export type BundleImportPlan = z.infer<typeof bundleImportPlanSchema>;

/** XLSX binary download marker for OpenAPI (actual body is the file bytes). */
export const xlsxDownloadSchema = z.unknown();
