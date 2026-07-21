import { z } from 'zod';
import { isoDateTime, supportedCurrencySchema, uuid } from './common.js';

export const tenantSchema = z.object({
	id: uuid,
	name: z.string().min(1).max(255),
	slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
	base_currency: supportedCurrencySchema.default('TRY'),
	/** UI label for the patient/case section (legacy: cases_section_label) */
	patients_section_label: z.string().min(1).max(80).default('Hastalar'),
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
