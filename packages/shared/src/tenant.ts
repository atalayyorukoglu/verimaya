import { z } from 'zod';
import { isoDateTime, supportedCurrencySchema, uuid } from './common.js';

/** IANA timezones exposed in tenant settings (expand as needed). */
export const TENANT_TIMEZONES = [
	'Europe/Istanbul',
	'Asia/Riyadh',
	'Europe/London',
	'UTC'
] as const;

/** TIME-01 varsayılanı — DB kolon default'u (`tenants.timezone`) ile aynı kalmalı. */
export const DEFAULT_TENANT_TIMEZONE = 'Europe/Istanbul' as const;

export const tenantTimezoneSchema = z.enum(TENANT_TIMEZONES);

export type TenantTimezone = z.infer<typeof tenantTimezoneSchema>;

export const tenantSchema = z.object({
	id: uuid,
	name: z.string().min(1).max(255),
	slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
	base_currency: supportedCurrencySchema.default('TRY'),
	/** UI label for the patient/case section (legacy: cases_section_label) */
	patients_section_label: z.string().min(1).max(80).default('Hastalar'),
	timezone: tenantTimezoneSchema.default('Europe/Istanbul'),
	created_at: isoDateTime
});

export type Tenant = z.infer<typeof tenantSchema>;

export const tenantCreateSchema = tenantSchema.omit({
	id: true,
	created_at: true
});

export type TenantCreate = z.infer<typeof tenantCreateSchema>;

/** Slug is immutable after creation. */
export const tenantUpdateSchema = tenantCreateSchema.omit({ slug: true }).partial();

export type TenantUpdate = z.infer<typeof tenantUpdateSchema>;
