import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

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

/**
 * Contact (Tracker: contacts) — CRM directory / cari.
 * Not a patient episode; Patient (Case) may optionally link via contact_id.
 */
export const contactSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_type_id: uuid,
	/** Denormalized type name for list views */
	contact_type_name: z.string().min(1).max(128),
	display_name: z.string().min(1).max(255),
	phone: z.string().max(64).nullable(),
	email: z.string().email().max(255).nullable(),
	notes: z.string().max(8000).nullable(),
	/** Company staff — responsible party on transactions */
	is_internal: z.boolean().default(false),
	/** Appointments + transactions referencing this contact */
	usage_count: z.number().int().nonnegative().default(0),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Contact = z.infer<typeof contactSchema>;

export const contactCreateSchema = z.object({
	contact_type_id: uuid,
	display_name: z.string().min(1).max(255),
	phone: z.string().max(64).nullable().optional(),
	email: z.string().email().max(255).nullable().optional(),
	notes: z.string().max(8000).nullable().optional(),
	is_internal: z.boolean().optional()
});

export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = contactCreateSchema.partial();

export type ContactUpdate = z.infer<typeof contactUpdateSchema>;
