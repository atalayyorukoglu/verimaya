import { z } from 'zod';
import { uuid } from './common.js';
import { contactSchema, type Contact } from './contact.js';
import { patientSchema, type Patient } from './patient.js';

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

export function normEmailKey(email: string | null | undefined): string | null {
	const e = email?.trim().toLowerCase();
	return e && e.includes('@') ? e : null;
}

/** Digits only; TR mobiles use last 10 when longer. */
export function normPhoneKey(phone: string | null | undefined): string | null {
	if (!phone) return null;
	const digits = phone.replace(/\D/g, '');
	if (digits.length < 7) return null;
	return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normNameKey(name: string | null | undefined): string | null {
	if (!name) return null;
	const n = name
		.trim()
		.replaceAll('İ', 'i')
		.replaceAll('I', 'ı')
		.toLocaleLowerCase('tr')
		.replace(/\s+/g, ' ');
	return n.length >= 2 ? n : null;
}

function buckets<T>(rows: T[], keyOf: (row: T) => string | null): Array<[string, T[]]> {
	const map = new Map<string, T[]>();
	for (const row of rows) {
		const key = keyOf(row);
		if (!key) continue;
		const list = map.get(key) ?? [];
		list.push(row);
		map.set(key, list);
	}
	return [...map.entries()].filter(([, items]) => items.length > 1);
}

function pushGroups<TItem, TGroup>(
	out: TGroup[],
	match_type: DuplicateMatchType,
	pairs: Array<[string, TItem[]]>,
	build: (match_type: DuplicateMatchType, label: string, items: TItem[]) => TGroup
) {
	for (const [label, items] of pairs) {
		out.push(build(match_type, label, items));
	}
}

export function findContactDuplicateGroups(contacts: Contact[]): ContactDuplicateGroup[] {
	const out: ContactDuplicateGroup[] = [];
	const build = (
		match_type: DuplicateMatchType,
		label: string,
		items: Contact[]
	): ContactDuplicateGroup => ({ match_type, label, contacts: items });

	pushGroups(out, 'email', buckets(contacts, (c) => normEmailKey(c.email)), build);
	pushGroups(out, 'phone', buckets(contacts, (c) => normPhoneKey(c.phone)), build);
	pushGroups(out, 'name', buckets(contacts, (c) => normNameKey(c.display_name)), build);

	out.sort(
		(a, b) =>
			b.contacts.length - a.contacts.length || a.match_type.localeCompare(b.match_type)
	);
	return out;
}

export function findPatientDuplicateGroups(patients: Patient[]): PatientDuplicateGroup[] {
	const out: PatientDuplicateGroup[] = [];
	const build = (
		match_type: DuplicateMatchType,
		label: string,
		items: Patient[]
	): PatientDuplicateGroup => ({ match_type, label, patients: items });

	pushGroups(out, 'email', buckets(patients, (p) => normEmailKey(p.email)), build);
	pushGroups(out, 'phone', buckets(patients, (p) => normPhoneKey(p.phone)), build);
	pushGroups(out, 'name', buckets(patients, (p) => normNameKey(p.full_name)), build);

	out.sort(
		(a, b) =>
			b.patients.length - a.patients.length || a.match_type.localeCompare(b.match_type)
	);
	return out;
}
