import { z } from 'zod';
import { isoDateTime, moneyMinor, uuid } from './common.js';

/**
 * Contact type (Tracker: contact_types) — Otel, Klinik, Transfer, Hasta, …
 * Soft names; tenant-editable via settings.
 */
export const contactTypeSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	name: z.string().min(1).max(128),
	sort_order: z.number().int().nonnegative().default(0),
	created_at: isoDateTime
});

export type ContactType = z.infer<typeof contactTypeSchema>;

export const contactTypeCreateSchema = z.object({
	name: z.string().min(1).max(128)
});

export type ContactTypeCreate = z.infer<typeof contactTypeCreateSchema>;

/** GAP-F09-17 (G-18): rename — same fields as create, reject unknown keys. */
export const contactTypeUpdateSchema = contactTypeCreateSchema.strict();

export type ContactTypeUpdate = z.infer<typeof contactTypeUpdateSchema>;

/**
 * Firm dictionary (§0-A / DOMAIN-02): Klinik / Otel / Transfer seçilince
 * hangi kurum — tenant-editable via settings (same pattern as contact types).
 */
export const organizationSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	name: z.string().min(1).max(128),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Organization = z.infer<typeof organizationSchema>;

export const organizationCreateSchema = z.object({
	name: z.string().min(1).max(128)
});

export type OrganizationCreate = z.infer<typeof organizationCreateSchema>;

/** Rename — same fields as create, reject unknown keys (mirrors contactTypeUpdateSchema). */
export const organizationUpdateSchema = organizationCreateSchema.strict();

export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;

/**
 * GAP-F09-17 (G-17): bulk assign contact type.
 * Tracker (`ContactBulkSetTypeBody`) requires a UUID — not null. Verimaya
 * `contacts.contact_type_id` is NOT NULL, so clearing a type is unsupported.
 */
export const contactsBulkTypeSchema = z
	.object({
		contact_ids: z.array(uuid).min(1).max(500),
		contact_type_id: uuid
	})
	.strict();

export type ContactsBulkType = z.infer<typeof contactsBulkTypeSchema>;

export const contactsBulkTypeResultSchema = z.object({
	updated: z.number().int().nonnegative()
});

export type ContactsBulkTypeResult = z.infer<typeof contactsBulkTypeResultSchema>;

/**
 * Operational status for Hasta-type contacts (from patients.status).
 * Sales pipeline lives in GHL; app status is operational only.
 */
export const contactStatusSchema = z.enum([
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'cancelled'
]);

export type ContactStatus = z.infer<typeof contactStatusSchema>;

/**
 * Primary acquisition channel labels for `contacts.source` (panel select).
 * Stored as display labels (not lowercase keys) so reports group by the raw string.
 * DOMAIN-02 §0-C: reports group by source; medium is a second-level breakout.
 */
export const CONTACT_SOURCE_PRESETS = [
	'Dijital Reklam',
	'Referans',
	'Organik',
	'WhatsApp',
	'Diğer'
] as const;

export type ContactSourcePreset = (typeof CONTACT_SOURCE_PRESETS)[number];

/**
 * Sub-channel labels for `contacts.medium` (panel select).
 * Meaningful mainly when source is `Dijital Reklam` (or similar).
 */
export const CONTACT_MEDIUM_PRESETS = [
	'Meta Ads',
	'Google Ads',
	'Instagram',
	'TikTok',
	'Web Formu',
	'Telefon'
] as const;

export type ContactMediumPreset = (typeof CONTACT_MEDIUM_PRESETS)[number];

/**
 * Contact (panel: Kişiler) — always a person.
 * Organization / clinic / hotel is a quality via contact_type + organization_id,
 * not a separate entity kind. display_name is server-derived from first+last.
 */
export const contactSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_type_id: uuid,
	/** Denormalized type name for list views */
	contact_type_name: z.string().min(1).max(128),
	first_name: z.string().min(1).max(255),
	last_name: z.string().max(255).nullable(),
	/** Derived: trim(first_name || ' ' || last_name) — read-only on wire */
	display_name: z.string().min(1).max(255),
	phone: z.string().max(64).nullable(),
	email: z.string().email().max(255).nullable(),
	notes: z.string().max(8000).nullable(),
	/** Firm dictionary row when contact_type carries an organization (§0-A) */
	organization_id: uuid.nullable().default(null),
	/** Operational status; meaningful for Hasta type only */
	status: contactStatusSchema.nullable().default(null),
	assigned_user_id: uuid.nullable().default(null),
	source: z.string().max(128).nullable().default(null),
	medium: z.string().max(128).nullable().default(null),
	campaign: z.string().max(128).nullable().default(null),
	referred_by_contact_id: uuid.nullable().default(null),
	/** Company staff — responsible party on transactions */
	is_internal: z.boolean().default(false),
	/** Appointments + transactions referencing this contact */
	usage_count: z.number().int().nonnegative().default(0),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Contact = z.infer<typeof contactSchema>;

/**
 * Create body — display_name is NOT accepted (server derives from first/last).
 */
export const contactCreateSchema = z.object({
	contact_type_id: uuid,
	first_name: z.string().min(1).max(255),
	last_name: z.string().max(255).nullable().optional(),
	phone: z.string().max(64).nullable().optional(),
	email: z.string().email().max(255).nullable().optional(),
	notes: z.string().max(8000).nullable().optional(),
	organization_id: uuid.nullable().optional(),
	status: contactStatusSchema.nullable().optional(),
	assigned_user_id: uuid.nullable().optional(),
	source: z.string().max(128).nullable().optional(),
	medium: z.string().max(128).nullable().optional(),
	campaign: z.string().max(128).nullable().optional(),
	referred_by_contact_id: uuid.nullable().optional(),
	is_internal: z.boolean().optional()
});

export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = contactCreateSchema.partial();

export type ContactUpdate = z.infer<typeof contactUpdateSchema>;

export const contactFinanceSummarySchema = z.object({
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	paid_base: moneyMinor,
	outstanding_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});

export type ContactFinanceSummary = z.infer<typeof contactFinanceSummarySchema>;

/**
 * Bulk-link unassigned transactions that share this contact's identity.
 * Bodyless POST; `updated` is the real row count mutated.
 */
export const contactAutoLinkTransactionsResultSchema = z.object({
	updated: z.number().int().nonnegative()
});

export type ContactAutoLinkTransactionsResult = z.infer<
	typeof contactAutoLinkTransactionsResultSchema
>;
