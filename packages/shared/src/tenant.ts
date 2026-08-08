import { z } from 'zod';
import { isoDateTime, supportedCurrencySchema, uuid } from './common.js';

/** IANA timezones exposed in tenant settings UI (expand as needed). */
export const TENANT_TIMEZONES = [
	'Europe/Istanbul',
	'Asia/Riyadh',
	'Europe/London',
	'UTC'
] as const;

/** TIME-01 varsayılanı — DB kolon default'u (`tenants.timezone`) ile aynı kalmalı. */
export const DEFAULT_TENANT_TIMEZONE = 'Europe/Istanbul' as const;

/** UI select option type — not the full IANA surface the API accepts. */
export type TenantTimezone = (typeof TENANT_TIMEZONES)[number];

/**
 * AUDIT-F09-19: accept any timezone `Intl` can resolve (UTC / Etc/UTC aliases included).
 * Prefer runtime probe over `supportedValuesOf` — ICU lists omit aliases and shift by version.
 */
export function isIanaTimeZone(value: string): boolean {
	if (!value || value.length > 64) return false;
	try {
		new Intl.DateTimeFormat(undefined, { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

export const INVALID_TIMEZONE_CODE = 'invalid_timezone' as const;

export const tenantTimezoneSchema = z
	.string()
	.trim()
	.min(1)
	.max(64)
	.refine((v) => isIanaTimeZone(v), {
		message: 'Invalid IANA timezone',
		params: { code: INVALID_TIMEZONE_CODE }
	});

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
	timezone: tenantTimezoneSchema.default(DEFAULT_TENANT_TIMEZONE),
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
