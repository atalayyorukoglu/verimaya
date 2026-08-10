/**
 * Field ownership for GHL ↔ Verimaya sync (MIMARI değişmez ilke 5 / Adım 42).
 *
 * On conflict the owner wins; the other side's value is not applied (caller may audit).
 */

export type FieldOwner = 'ghl' | 'verimaya';

/** Contact columns touched by GHL inbound sync. */
export type GhlContactSyncField = 'fullName' | 'phone' | 'email' | 'status' | 'notes';

export const GHL_CONTACT_FIELD_OWNERSHIP: Record<GhlContactSyncField, FieldOwner> = {
	fullName: 'ghl',
	phone: 'ghl',
	email: 'ghl',
	/** Lead / pipeline proxy until opportunities map lands. */
	status: 'ghl',
	notes: 'verimaya'
};

/**
 * Throws if `side` tries to write a field it does not own.
 * Used by sync paths and unit tests (Adım 42 kabul: sahiplik ihlali yakalanır).
 */
export function assertFieldWriteAllowed(
	entity: 'contact',
	field: GhlContactSyncField,
	side: FieldOwner
): void {
	if (entity !== 'contact') {
		throw new Error(`Unknown GHL ownership entity: ${entity}`);
	}
	const owner = GHL_CONTACT_FIELD_OWNERSHIP[field];
	if (owner !== side) {
		throw new Error(
			`Field ownership violation: contact.${field} is owned by ${owner}, not ${side}`
		);
	}
}

/**
 * Keeps only fields `side` is allowed to write. Does not throw — for soft apply paths.
 */
export function pickOwnedFields<T extends Partial<Record<GhlContactSyncField, unknown>>>(
	patch: T,
	side: FieldOwner
): Partial<Record<GhlContactSyncField, unknown>> {
	const out: Partial<Record<GhlContactSyncField, unknown>> = {};
	for (const key of Object.keys(patch) as GhlContactSyncField[]) {
		if (GHL_CONTACT_FIELD_OWNERSHIP[key] === side && patch[key] !== undefined) {
			out[key] = patch[key];
		}
	}
	return out;
}
