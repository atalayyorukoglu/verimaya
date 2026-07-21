import { z } from 'zod';
import { uuid } from './common.js';
import { contactSchema } from './contact.js';
import { patientSchema } from './patient.js';

/** How records were grouped as likely duplicates. */
export const duplicateMatchTypeSchema = z.enum(['email', 'phone', 'name']);

export type DuplicateMatchType = z.infer<typeof duplicateMatchTypeSchema>;

export const contactDuplicateGroupSchema = z.object({
	match_type: duplicateMatchTypeSchema,
	label: z.string().min(1),
	contacts: z.array(contactSchema).min(2)
});

export type ContactDuplicateGroup = z.infer<typeof contactDuplicateGroupSchema>;

export const patientDuplicateGroupSchema = z.object({
	match_type: duplicateMatchTypeSchema,
	label: z.string().min(1),
	patients: z.array(patientSchema).min(2)
});

export type PatientDuplicateGroup = z.infer<typeof patientDuplicateGroupSchema>;

/** Keep one record; merge_ids are absorbed then removed. */
export const mergeRecordsSchema = z.object({
	keep_id: uuid,
	merge_ids: z.array(uuid).min(1)
});

export type MergeRecords = z.infer<typeof mergeRecordsSchema>;

export const duplicateMatchTypeLabels: Record<DuplicateMatchType, string> = {
	email: 'E-posta',
	phone: 'Telefon',
	name: 'Ad'
};
