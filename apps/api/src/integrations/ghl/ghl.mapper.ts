import type { GhlEventKind } from './ghl.types';

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
		'contact_id',
		'locationId'
	]);
}
