/**
 * GAP-29: warn (do not block) when the selected appointment contact lacks phone and/or email.
 */

export type ContactInfoFields = {
	phone?: string | null;
	email?: string | null;
};

export type ContactInfoMissingKind = 'phone' | 'email' | 'both';

export type ContactInfoWarningKey =
	| 'appointments.form.contactInfoMissingPhone'
	| 'appointments.form.contactInfoMissingEmail'
	| 'appointments.form.contactInfoMissingBoth';

function isBlank(value: string | null | undefined): boolean {
	return !value?.trim();
}

/** Returns which contact channels are missing, or null when both phone and email are present. */
export function contactInfoMissingKind(
	contact: ContactInfoFields | null | undefined
): ContactInfoMissingKind | null {
	if (!contact) return null;
	const missingPhone = isBlank(contact.phone);
	const missingEmail = isBlank(contact.email);
	if (missingPhone && missingEmail) return 'both';
	if (missingPhone) return 'phone';
	if (missingEmail) return 'email';
	return null;
}

export function contactInfoWarningMessageKey(
	kind: ContactInfoMissingKind | null
): ContactInfoWarningKey | null {
	if (kind === 'phone') return 'appointments.form.contactInfoMissingPhone';
	if (kind === 'email') return 'appointments.form.contactInfoMissingEmail';
	if (kind === 'both') return 'appointments.form.contactInfoMissingBoth';
	return null;
}

/** Advisory only — never gates create/update (GAP-29). */
export function contactInfoBlocksSave(): boolean {
	return false;
}
