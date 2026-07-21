import type {
	Contact,
	ContactDuplicateGroup,
	DuplicateMatchType,
	Patient,
	PatientDuplicateGroup
} from '@verimaya/shared';

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
	// Fold Turkish dotted/dotless I before lowercasing so DEMIR ≈ Demir
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
