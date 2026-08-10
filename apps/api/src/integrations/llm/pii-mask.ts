import type { Contact } from '@verimaya/shared';
import type { LlmParseContext } from './llm.types';

/** Placeholders sent to external LLMs instead of raw PII. */
export const PII_PLACEHOLDERS = {
	phone: '[TELEFON]',
	email: '[EPOSTA]',
	tckn: '[TCKN]',
	iban: '[IBAN]',
	card: '[KART]',
	patient: '[HASTA]'
} as const;

export type MaskedLlmPatientHint = {
	/** Opaque UUID — same as Patient.id; never a display name. */
	patient_ref: string;
};

export type MaskedLlmUserPayload = {
	message: string;
	patients: MaskedLlmPatientHint[];
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** E-mail addresses. */
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/**
 * TR mobiles (+90 / 0 + 5xx) and loose international (+cc…) forms.
 * Avoids bare 3–5 digit amounts (e.g. "2900 GBP").
 */
const TR_MOBILE_RE =
	/(?<!\d)(?:\+90|0)\s*5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/g;
const INTL_PHONE_RE = /(?<!\d)\+[1-9]\d{0,2}[\s.-]?(?:\d[\s.-]?){6,14}\d(?!\d)/g;

/** Turkish national ID — 11 digits, first non-zero. */
const TCKN_RE = /(?<!\d)[1-9]\d{10}(?!\d)/g;

/** IBAN (TR and general). */
const IBAN_RE = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi;

/** Card-like groups with separators (not compact amounts). */
const CARD_RE = /\b(?:\d{4}[\s-]){3}\d{1,7}\b/g;

/**
 * Strip PII patterns from a WhatsApp message body destined for an external LLM.
 * Amounts/currency tokens are intentionally left intact.
 */
export function maskMessagePii(message: string): string {
	let out = message;
	out = out.replace(EMAIL_RE, PII_PLACEHOLDERS.email);
	out = out.replace(IBAN_RE, PII_PLACEHOLDERS.iban);
	out = out.replace(CARD_RE, PII_PLACEHOLDERS.card);
	out = out.replace(TR_MOBILE_RE, PII_PLACEHOLDERS.phone);
	out = out.replace(INTL_PHONE_RE, PII_PLACEHOLDERS.phone);
	out = out.replace(TCKN_RE, PII_PLACEHOLDERS.tckn);
	return out;
}

/** Replace known patient display names in the message with [HASTA]. */
export function maskPatientNamesInMessage(message: string, patients: Contact[]): string {
	let out = message;
	const names = patients
		.map((p) => p.display_name?.trim())
		.filter((n): n is string => Boolean(n) && n.length >= 2)
		.sort((a, b) => b.length - a.length);

	for (const name of names) {
		out = out.replace(new RegExp(escapeRegExp(name), 'gi'), PII_PLACEHOLDERS.patient);
	}
	return out;
}

export function toOpaquePatientHints(patients: Contact[]): MaskedLlmPatientHint[] {
	return patients.slice(0, 40).map((p) => ({ patient_ref: p.id }));
}

/**
 * Single choke point: build the user JSON for chat/completions.
 * Call only from the OpenAI-compatible HTTP path — never from the heuristic client.
 */
export function buildMaskedLlmUserPayload(ctx: LlmParseContext): MaskedLlmUserPayload {
	const withoutNames = maskPatientNamesInMessage(ctx.message, ctx.patients);
	return {
		message: maskMessagePii(withoutNames),
		patients: toOpaquePatientHints(ctx.patients)
	};
}
