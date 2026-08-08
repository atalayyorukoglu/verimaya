import { PATIENT_SOURCE_PRESETS } from '@verimaya/shared';

/**
 * Select sentinel for the free-text "other" branch — never submitted as source.
 * WHY a sentinel: the select must distinguish empty / preset / custom without
 * colliding with a real channel label (e.g. a legacy value equal to "Diğer").
 */
export const PATIENT_SOURCE_SELECT_OTHER = '__other__';

/**
 * Explicit "unknown channel" choice — required select always has a valid value,
 * but resolve maps this to null so marketing attribution stays unattributed.
 * Never store the display label or this sentinel in `patients.source`.
 */
export const PATIENT_SOURCE_SELECT_UNKNOWN = '__unknown__';

export type PatientSourceSelectState = {
	selectValue: string;
	customSource: string;
};

const presetSet = new Set<string>(PATIENT_SOURCE_PRESETS);

/**
 * Map a stored `patients.source` into select + optional custom field.
 * Legacy / non-preset values (e.g. GHL sync `ghl`) open in "other" mode so
 * editing never silently rewrites or drops them.
 * Null/empty source opens on Bilinmiyor (UNKNOWN sentinel), not a blank option.
 */
export function initPatientSourceSelect(
	source: string | null | undefined
): PatientSourceSelectState {
	const raw = source ?? '';
	const trimmed = raw.trim();
	if (!trimmed) {
		return { selectValue: PATIENT_SOURCE_SELECT_UNKNOWN, customSource: '' };
	}
	if (presetSet.has(trimmed)) {
		return { selectValue: trimmed, customSource: '' };
	}
	return { selectValue: PATIENT_SOURCE_SELECT_OTHER, customSource: trimmed };
}

/** Resolve select + custom field to the value written on create/update. */
export function resolvePatientSource(selectValue: string, customSource: string): string | null {
	if (selectValue === PATIENT_SOURCE_SELECT_UNKNOWN) {
		return null;
	}
	if (selectValue === PATIENT_SOURCE_SELECT_OTHER) {
		return customSource.trim() || null;
	}
	return selectValue.trim() || null;
}
