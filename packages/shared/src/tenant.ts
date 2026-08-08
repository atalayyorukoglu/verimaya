import { z } from 'zod';
import { isoDateTime, supportedCurrencySchema, uuid } from './common.js';

/** IANA timezones exposed in tenant settings UI (subset of all valid zones). */
export const TENANT_TIMEZONES = [
	'Europe/Istanbul',
	'Asia/Riyadh',
	'Europe/London',
	'UTC'
] as const;

/** TIME-01 varsayılanı — DB kolon default'u (`tenants.timezone`) ile aynı kalmalı. */
export const DEFAULT_TENANT_TIMEZONE = 'Europe/Istanbul' as const;

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

/** AUDIT-F09-19: reject invalid IANA identifiers at the contract boundary. */
export function isValidIanaTimezone(value: string): boolean {
	return IANA_TIMEZONES.has(value);
}

export const tenantTimezoneSchema = z
	.string()
	.refine(isValidIanaTimezone, { message: 'Invalid IANA timezone' })
	.default(DEFAULT_TENANT_TIMEZONE);

export type TenantTimezone = z.infer<typeof tenantTimezoneSchema>;

export const tenantSchema = z.object({
	id: uuid,
	name: z.string().min(1).max(255),
	slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
	base_currency: supportedCurrencySchema.default('TRY'),
	/**
	 * True once the tenant has ≥1 transaction — base_currency cannot change (409).
	 * Computed on read; not stored on tenants row.
	 */
	base_currency_locked: z.boolean().default(false),
	/** UI label for the patient/case section (legacy: cases_section_label) */
	patients_section_label: z.string().min(1).max(80).default('Hastalar'),
	timezone: tenantTimezoneSchema.default('Europe/Istanbul'),
	created_at: isoDateTime
});

export type Tenant = z.infer<typeof tenantSchema>;

export const tenantCreateSchema = tenantSchema.omit({
	id: true,
	created_at: true,
	base_currency_locked: true
});

export type TenantCreate = z.infer<typeof tenantCreateSchema>;

/** Slug is immutable after creation. */
export const tenantUpdateSchema = tenantCreateSchema.omit({ slug: true }).partial();

export type TenantUpdate = z.infer<typeof tenantUpdateSchema>;
