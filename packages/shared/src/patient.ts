import { z } from 'zod';
import { isoDateTime, moneyMinor, uuid } from './common.js';

/**
 * Patient = operasyon dosyası (epizot). Lead/pipeline GHL'de kalır; app yalnız
 * randevu, dosya ve finans operasyon durumlarını tutar.
 */
export const patientStatusSchema = z.enum([
	'scheduled',
	'arrived',
	'treated',
	'follow_up',
	'cancelled'
]);

export type PatientStatus = z.infer<typeof patientStatusSchema>;

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

/** Maps legacy CRM pipeline values to operation statuses (ETL + one-time migration). */
export const LEGACY_PATIENT_STATUS_MAP: Record<string, PatientStatus> = {
	lead: 'scheduled',
	contacted: 'scheduled',
	qualified: 'scheduled',
	scheduled: 'scheduled',
	arrived: 'arrived',
	treated: 'treated',
	follow_up: 'follow_up',
	closed_won: 'treated',
	closed_lost: 'cancelled'
};

export function mapLegacyPatientStatus(raw: string | null | undefined): PatientStatus {
	if (!raw) return 'scheduled';
	return LEGACY_PATIENT_STATUS_MAP[raw] ?? 'scheduled';
}
