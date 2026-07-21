import { z } from 'zod';
import { isoDateTime, moneyMinor, uuid } from './common.js';

/**
 * Patient (legacy: Case). Lead/hasta kaydı — sağlık turizmi operasyonunun çekirdeği.
 * Status pipeline is a first draft; refine after legacy notes.md is filled.
 */
export const patientStatusSchema = z.enum([
	'lead',
	'contacted',
	'qualified',
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'closed_won',
	'closed_lost'
]);

export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const patientSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	full_name: z.string().min(1).max(255),
	phone: z.string().max(64).nullable(),
	email: z.string().email().max(255).nullable(),
	status: patientStatusSchema.default('lead'),
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
	paid_base: moneyMinor,
	outstanding_base: moneyMinor,
	transaction_count: z.number().int().nonnegative()
});

export type PatientFinanceSummary = z.infer<typeof patientFinanceSummarySchema>;
