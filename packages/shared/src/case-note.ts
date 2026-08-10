import { z } from 'zod';
import { isoDateTime, uuid } from './common.js';

/**
 * Contact-scoped case notes (Tracker: contact case notes thread).
 * Shared across that contact's appointments — not appointment.notes.
 */
export const contactCaseNoteSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	contact_id: uuid,
	body: z.string().min(1).max(8000),
	author_display_name: z.string().min(1).max(255),
	created_at: isoDateTime
});

export type ContactCaseNote = z.infer<typeof contactCaseNoteSchema>;

export const contactCaseNoteCreateSchema = z.object({
	body: z.string().min(1).max(8000)
});

export type ContactCaseNoteCreate = z.infer<typeof contactCaseNoteCreateSchema>;
