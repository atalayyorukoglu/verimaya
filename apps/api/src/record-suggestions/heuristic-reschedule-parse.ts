import type {
	AppointmentRescheduleDraft,
	RecordUpdateSuggestionSkippedReason
} from '@verimaya/shared';
import type { LlmRescheduleAppointmentHint } from '../integrations/llm/llm.types';

const RESCHEDULE_HINTS =
	/ertel|ertelen|değiştir|degistir|kaydır|kaydir|alalım|alalim|reschedule|postpone|move to|new date|yeni tarih|randevu/i;

const ISO_DATE_RE = /\b(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{1,2})(?::(\d{2}))?)?\b/;
const DMY_RE = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})(?:\s+(\d{1,2})(?::(\d{2}))?)?\b/;

const TR_MONTHS: Record<string, number> = {
	ocak: 1,
	şubat: 2,
	subat: 2,
	mart: 3,
	nisan: 4,
	mayıs: 5,
	mayis: 5,
	haziran: 6,
	temmuz: 7,
	ağustos: 8,
	agustos: 8,
	eylül: 9,
	eylul: 9,
	ekim: 10,
	kasım: 11,
	kasim: 11,
	aralık: 12,
	aralik: 12
};

const TR_MONTH_DAY_RE =
	/\b(\d{1,2})\s+(ocak|şubat|subat|mart|nisan|mayıs|mayis|haziran|temmuz|ağustos|agustos|eylül|eylul|ekim|kasım|kasim|aralık|aralik)(?:\s+(20\d{2}))?(?:\s+(?:saat\s*)?(\d{1,2})(?::(\d{2}))?)?/i;

function toIsoUtc(
	year: number,
	month: number,
	day: number,
	hour = 10,
	minute = 0
): string | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const d = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
	if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
		return null;
	}
	return d.toISOString();
}

function parseTargetDate(text: string): string | null {
	const iso = text.match(ISO_DATE_RE);
	if (iso) {
		const hour = iso[4] ? Number.parseInt(iso[4], 10) : 10;
		const minute = iso[5] ? Number.parseInt(iso[5], 10) : 0;
		return toIsoUtc(
			Number.parseInt(iso[1], 10),
			Number.parseInt(iso[2], 10),
			Number.parseInt(iso[3], 10),
			hour,
			minute
		);
	}

	const dmy = text.match(DMY_RE);
	if (dmy) {
		const hour = dmy[4] ? Number.parseInt(dmy[4], 10) : 10;
		const minute = dmy[5] ? Number.parseInt(dmy[5], 10) : 0;
		return toIsoUtc(
			Number.parseInt(dmy[3], 10),
			Number.parseInt(dmy[2], 10),
			Number.parseInt(dmy[1], 10),
			hour,
			minute
		);
	}

	const tr = text.match(TR_MONTH_DAY_RE);
	if (tr) {
		const month = TR_MONTHS[tr[2].toLocaleLowerCase('tr')];
		if (!month) return null;
		const year = tr[3] ? Number.parseInt(tr[3], 10) : new Date().getUTCFullYear();
		const hour = tr[4] ? Number.parseInt(tr[4], 10) : 10;
		const minute = tr[5] ? Number.parseInt(tr[5], 10) : 0;
		return toIsoUtc(year, month, Number.parseInt(tr[1], 10), hour, minute);
	}

	return null;
}

function matchAppointmentsByContactName(
	text: string,
	appointments: LlmRescheduleAppointmentHint[]
): LlmRescheduleAppointmentHint[] {
	const lower = text.toLocaleLowerCase('tr');
	const hits = appointments.filter((a) => {
		const parts = a.contact_display_name
			.toLocaleLowerCase('tr')
			.split(/\s+/)
			.filter((p) => p.length > 2);
		return parts.some((part) => lower.includes(part));
	});
	if (hits.length > 0) return hits;

	const byId = appointments.filter((a) => lower.includes(a.appointment_id.toLowerCase()));
	return byId;
}

export type HeuristicRescheduleParseResult = {
	drafts: AppointmentRescheduleDraft[];
	/** Set only when drafts are empty and the skip cause is known; never invent a reason. */
	skipped_reason: RecordUpdateSuggestionSkippedReason | null;
};

/**
 * Deterministic appointment reschedule parser (HeuristicLlmClient / LLM fallback).
 * Returns empty drafts when patient or appointment match is ambiguous, or target date is unclear
 * (Madde 6.2 — no guessing). Callers surface `skipped_reason` to the user.
 */
export function heuristicSuggestAppointmentReschedule(
	message: string,
	appointments: LlmRescheduleAppointmentHint[] = []
): HeuristicRescheduleParseResult {
	const text = message.trim();
	if (!text || appointments.length === 0) {
		return { drafts: [], skipped_reason: null };
	}

	const targetIso = parseTargetDate(text);
	if (!RESCHEDULE_HINTS.test(text) && !targetIso) {
		return { drafts: [], skipped_reason: 'no_date' };
	}
	if (!targetIso) {
		return { drafts: [], skipped_reason: 'no_date' };
	}

	const matched = matchAppointmentsByContactName(text, appointments);
	if (matched.length !== 1) {
		return {
			drafts: [],
			skipped_reason: matched.length > 1 ? 'ambiguous_contact' : null
		};
	}

	const appt = matched[0]!;
	if (appt.starts_at === targetIso) {
		return { drafts: [], skipped_reason: 'no_change' };
	}

	return {
		drafts: [
			{
				appointment_id: appt.appointment_id,
				suggested_value: targetIso,
				confidence: 'medium',
				reason: text.slice(0, 4000)
			}
		],
		skipped_reason: null
	};
}
