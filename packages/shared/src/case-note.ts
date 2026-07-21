import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * Patient-scoped case notes (Tracker: contact case notes thread).
 * Shared across that patient's appointments — not appointment.notes.
 */
export const patientCaseNoteSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	patient_id: uuid,
	body: z.string().min(1).max(8000),
	author_display_name: z.string().min(1).max(255),
	created_at: isoDateTime
});

export type PatientCaseNote = z.infer<typeof patientCaseNoteSchema>;

export const patientCaseNoteCreateSchema = z.object({
	body: z.string().min(1).max(8000)
});

export type PatientCaseNoteCreate = z.infer<typeof patientCaseNoteCreateSchema>;
