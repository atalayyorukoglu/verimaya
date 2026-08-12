import { DEFAULT_CONTACT_TYPE_NAMES } from './defaults.js';

/** Institutional contact types — sort by full display name, not Ad/Soyad split. */
export const CONTACT_INSTITUTION_TYPE_NAMES = [
	DEFAULT_CONTACT_TYPE_NAMES[1],
	DEFAULT_CONTACT_TYPE_NAMES[2],
	DEFAULT_CONTACT_TYPE_NAMES[3]
] as const;

export type ContactListSortInput = {
	contact_type_name: string;
	display_name: string;
	first_name: string;
	last_name: string | null;
};

export type ContactListSortKeys = {
	sortLastName: string | null;
	sortFirstName: string;
};

function isInstitutionContactType(contactTypeName: string): boolean {
	return (CONTACT_INSTITUTION_TYPE_NAMES as readonly string[]).includes(contactTypeName);
}

function splitDisplayName(displayName: string): { first: string; last: string | null } {
	const display = displayName.trim();
	if (!display) return { first: '', last: null };
	const space = display.indexOf(' ');
	if (space === -1) return { first: display, last: null };
	const first = display.slice(0, space).trim();
	const last = display.slice(space + 1).trim();
	return { first: first || display, last: last || null };
}

/**
 * Phonebook sort keys for GET /v1/contacts.
 * Uses stored last_name when set; otherwise derives surname from display_name
 * (same heuristic as migration 0035) so legacy rows with first_name = full name still sort correctly.
 */
export function contactListSortKeys(contact: ContactListSortInput): ContactListSortKeys {
	const display = contact.display_name.trim();
	if (isInstitutionContactType(contact.contact_type_name)) {
		return { sortLastName: null, sortFirstName: display };
	}

	const storedLast = contact.last_name?.trim() || null;
	if (storedLast) {
		const storedFirst = contact.first_name?.trim();
		const { first: fromDisplay } = splitDisplayName(display);
		return {
			sortLastName: storedLast,
			sortFirstName: storedFirst || fromDisplay || display
		};
	}

	const { first, last } = splitDisplayName(display);
	return { sortLastName: last, sortFirstName: first || display };
}
