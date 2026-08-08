import { z } from 'zod';
import { isoDateTime, moneyMinor, uuid } from './common.js';

/**
 * Patient = operations file for one visit (not a CRM lead).
 * Sales pipeline lives in GHL; app status is operational only.
 */
export const patientStatusSchema = z.enum([
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'cancelled'
]);

export type PatientStatus = z.infer<typeof patientStatusSchema>;

/**
 * Preset channel labels for `patients.source` (panel select).
 * Stored as display labels (not lowercase keys) because the marketing report
 * groups by the raw source string (`sourceLabel` in reports.service.ts) —
 * keeping the label readable in the breakdown avoids a mapping layer.
 * Do not change that report grouping; this list is the UI contract only.
 */
export const PATIENT_SOURCE_PRESETS = [
	'Meta',
	'Google',
	'WhatsApp',
	'Tavsiye',
	'Organik'
] as const;

export type PatientSourcePreset = (typeof PATIENT_SOURCE_PRESETS)[number];

export const patientSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	full_name: z.string().min(1).max(255),
	phone: z.string().max(64).nullable(),
	email: z.string().email().max(255).nullable(),
	status: patientStatusSchema.default('scheduled'),
	source: z.string().max(128).nullable(),
	notes: z.string().max(8000).nullable(),
	assigned_user_id: uuid.nullable(),
	/** Optional link to directory Contact (typically type Hasta) */
	contact_id: uuid.nullable().default(null),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type Patient = z.infer<typeof patientSchema>;

export const patientCreateSchema = patientSchema.omit({
	id: true,
	tenant_id: true,
	created_at: true,
	updated_at: true
});

export type PatientCreate = z.infer<typeof patientCreateSchema>;

export const patientUpdateSchema = patientCreateSchema.partial();

export type PatientUpdate = z.infer<typeof patientUpdateSchema>;

export const patientFinanceSummarySchema = z.object({
	income_base: moneyMinor,
	expense_base: moneyMinor,
	net_base: moneyMinor,
	paid_base: moneyMinor,
	outstanding_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});

export type PatientFinanceSummary = z.infer<typeof patientFinanceSummarySchema>;
