import type { GhlContactFields, GhlEventKind } from './ghl.types';

function asRecord(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function pickString(source: Record<string, unknown> | null, keys: string[]): string | null {
	if (!source) return null;
	for (const key of keys) {
		const value = source[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

/**
 * Display / fallback name. Prefer GHL's separate first/last (correct casing +
 * field boundaries) over combined fields, which GHL often lowercases.
 */
function composeFullName(source: Record<string, unknown> | null): string | null {
	const first = pickString(source, ['firstName', 'first_name']);
	const last = pickString(source, ['lastName', 'last_name']);
	const fromParts = [first, last].filter(Boolean).join(' ').trim();
	if (fromParts) return fromParts;

	return pickString(source, ['fullName', 'full_name', 'name', 'contactName']);
}

/**
 * GHL webhook payload → internal event kind (contact vs opportunity).
 * Real payload shapes vary (`type: 'ContactCreate'`, nested `contact`/`opportunity` objects,
 * or flat `contactId`/`opportunityId` fields) — this stub covers the common ones defensively
 * until OAuth + the real GHL adapter ship (Faz 4).
 */
export function detectGhlEventKind(payload: Record<string, unknown>): GhlEventKind {
	const type = pickString(payload, ['type', 'eventType', 'event_type'])?.toLowerCase() ?? '';
	if (type.includes('opportunity')) return 'opportunity';
	if (type.includes('contact')) return 'contact';

	if (
		asRecord(payload.opportunity) ||
		pickString(payload, ['opportunityId', 'opportunity_id'])
	) {
		return 'opportunity';
	}
	if (asRecord(payload.contact) || pickString(payload, ['contactId', 'contact_id'])) {
		return 'contact';
	}

	return 'unknown';
}

/** Best-effort external id extraction for the detected entity kind. */
export function extractGhlExternalId(
	payload: Record<string, unknown>,
	kind: GhlEventKind
): string | null {
	const inner =
		kind === 'opportunity'
			? (asRecord(payload.opportunity) ?? payload)
			: kind === 'contact'
				? (asRecord(payload.contact) ?? payload)
				: payload;

	return pickString(inner, [
		'id',
		'opportunityId',
		'opportunity_id',
		'contactId',
		'contact_id'
	]);
}

/**
 * Extracts minimal contact fields from a fixture-shaped GHL webhook payload.
 * Looks at nested `contact`, then the opportunity's contact, then top-level fields.
 */
export function extractGhlContactFields(payload: Record<string, unknown>): GhlContactFields {
	const kind = detectGhlEventKind(payload);
	const nestedContact =
		asRecord(payload.contact) ??
		asRecord(asRecord(payload.opportunity)?.contact) ??
		(kind === 'contact' ? payload : null);

	const source = nestedContact ?? payload;
	const externalId =
		pickString(source, ['id', 'contactId', 'contact_id']) ??
		(kind === 'contact' ? extractGhlExternalId(payload, 'contact') : null);

	return {
		externalId,
		firstName: pickString(source, ['firstName', 'first_name']),
		lastName: pickString(source, ['lastName', 'last_name']),
		fullName: composeFullName(source),
		phone: pickString(source, ['phone', 'phoneNumber', 'phone_number']),
		email: pickString(source, ['email', 'emailAddress', 'email_address'])
	};
}

/** Marker stored in `patients.notes` to map GHL contact ids without a new table/migration. */
export function ghlContactNotesMarker(externalId: string): string {
	return `ghl_contact_id=${externalId}`;
}
