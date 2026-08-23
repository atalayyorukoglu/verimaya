import type { Contact, MayaContactRef } from '@verimaya/shared';
import type {
	LlmParseContext,
	LlmRescheduleContext,
	MayaToolSelectionContext
} from './llm.types';

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
	/**
	 * Mesajdaki `KISI_1`, `KISI_2`… token'ı. **Bu alan olmadan liste işe yaramaz:**
	 * eskiden yalnız `patient_ref` gönderiliyordu ve mesajdaki isimler tek tip `[HASTA]`
	 * ile maskeleniyordu — model hangi UUID'nin hangi `[HASTA]` olduğunu bilemiyordu,
	 * dolayısıyla `contact_id` hiçbir zaman doğru dolamıyordu. (2026-08-23 ölçümü:
	 * liste büyüdükçe çıktı kalitesi de düşüyordu, çünkü liste saf gürültüydü.)
	 *
	 * Desen AI-11a'daki `maya-contact-match.ts`'ten alındı; isim yine dışarı çıkmıyor.
	 */
	token: string;
	/** Opaque UUID — same as Patient.id; never a display name. */
	patient_ref: string;
};

export type MaskedLlmUserPayload = {
	message: string;
	patients: MaskedLlmPatientHint[];
};

export type MaskedRescheduleAppointmentHint = {
	appointment_ref: string;
	starts_at: string;
};

export type MaskedReschedulePayload = {
	message: string;
	appointments: MaskedRescheduleAppointmentHint[];
};

/** AI-11a — Maya araç seçici için modele giden tek gövde. İsim/telefon içermez. */
export type MaskedMayaToolPayload = {
	question: string;
	contacts: MayaContactRef[];
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
/**
 * Mesajdaki kişi adlarını `KISI_n` token'ına çevirir ve yalnız **mesajda geçen**
 * kişiler için token ↔ UUID eşlemesi üretir.
 *
 * Üç kural:
 * 1. **Yalnız geçenler gönderilir.** Eskiden ilk 40 kişi körlemesine gönderiliyordu;
 *    mesajda adı geçmeyen kişi modele hiçbir şey katmıyor, sadece bağlamı şişiriyor.
 * 2. **Belirsizse token üretilmez.** Aynı ad birden çok kişiye uyuyorsa o ad düz
 *    `[HASTA]` olur — AI-02/AI-11a ile aynı ilke: tahmin edilen kişi, cevapsızlıktan
 *    pahalıdır (yanlış hastanın dosyasına para yazılır).
 * 3. **İsim dışarı çıkmaz.** Model yalnız token görür.
 *
 * Uzun adlar önce değiştirilir ki "Ali" kısa adı "Ali Veli"nin içini bozmasın.
 */
export function tokenizePatientNames(
	message: string,
	patients: Contact[]
): { message: string; hints: MaskedLlmPatientHint[] } {
	const named = patients
		.map((p) => ({ id: p.id, name: (p.display_name ?? '').trim() }))
		.filter((p) => p.name.length >= 3)
		.sort((a, b) => b.name.length - a.name.length);

	// Aynı görünen ada sahip kişi sayısı — belirsizlik kontrolü.
	const countByName = new Map<string, number>();
	for (const p of named) {
		const key = p.name.toLocaleLowerCase('tr');
		countByName.set(key, (countByName.get(key) ?? 0) + 1);
	}

	let out = message;
	const hints: MaskedLlmPatientHint[] = [];
	const seen = new Set<string>();

	for (const p of named) {
		const key = p.name.toLocaleLowerCase('tr');
		const pattern = new RegExp(escapeRegExp(p.name), 'gi');
		if (!pattern.test(out)) continue;
		pattern.lastIndex = 0;

		if ((countByName.get(key) ?? 0) > 1) {
			// Belirsiz: token yok, düz yer tutucu.
			out = out.replace(pattern, PII_PLACEHOLDERS.patient);
			continue;
		}
		if (seen.has(key)) continue;
		seen.add(key);

		const token = `KISI_${hints.length + 1}`;
		out = out.replace(pattern, token);
		hints.push({ token, patient_ref: p.id });
		if (hints.length >= 20) break;
	}

	return { message: out, hints };
}

/** Geriye dönük ad: yalnız maskeler, token üretmez (eski çağıranlar ve testler için). */
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

/**
 * Single choke point: build the user JSON for chat/completions.
 * Call only from the OpenAI-compatible HTTP path — never from the heuristic client.
 */
export function buildMaskedLlmUserPayload(ctx: LlmParseContext): MaskedLlmUserPayload {
	const { message, hints } = tokenizePatientNames(ctx.message, ctx.patients);
	return {
		message: maskMessagePii(message),
		patients: hints
	};
}

/**
 * AI-11a — Maya araç seçici gövdesinin tek çıkış noktası.
 *
 * `ctx.question` sunucuda zaten maskelenmiş gelir (isimler `KISI_n` token'ına
 * çevrilmiştir); burada `maskMessagePii` ikinci kez uygulanır — idempotenttir ve
 * sunucu tarafındaki bir kaçağın dışarı çıkmasını engelleyen son kapıdır.
 * Kişi listesi yalnız token + opak UUID taşır; **isim buradan geçemez.**
 */
export function buildMaskedMayaToolPayload(
	ctx: MayaToolSelectionContext
): MaskedMayaToolPayload {
	return {
		question: maskMessagePii(ctx.question),
		contacts: ctx.contacts
			.slice(0, 20)
			.map((c) => ({ token: c.token, contact_ref: c.contact_ref }))
	};
}

/** Single choke point for AI-02 reschedule user JSON — no display names to external LLMs. */
export function buildMaskedReschedulePayload(ctx: LlmRescheduleContext): MaskedReschedulePayload {
	let message = ctx.message;
	for (const appt of ctx.appointments) {
		message = maskPatientNamesInMessage(message, [
			{
				id: appt.appointment_id,
				display_name: appt.contact_display_name
			} as Contact
		]);
	}
	return {
		message: maskMessagePii(message),
		appointments: ctx.appointments.slice(0, 80).map((a) => ({
			appointment_ref: a.appointment_id,
			starts_at: a.starts_at
		}))
	};
}
