import {
	type MayaContactRef,
	type MayaPeriod,
	type MayaToolCall,
	type MayaUntouchedDays,
	mayaToolCallSchema
} from '@verimaya/shared';

/**
 * AI-11a — LLM'siz (ya da LLM hatası hâlinde) deterministik araç yönlendirici.
 *
 * Bu bir "tahmin" değil, kelime eşlemesidir: **hiçbir veri üretmez**, yalnız hangi
 * sorgunun çalıştırılacağını seçer. Rakam yine Postgres'ten gelir, izin yine araç
 * başına kontrol edilir. Eşleşme yoksa `null` döner ve cevap `BILINMIYOR` olur.
 *
 * Bilgi bankası soruları (fiyat, paket, ödeme kuralı) bilinçli olarak hiçbir anahtar
 * kelimeye takılmaz — o yol bozulmadan çalışmaya devam etmeli.
 */

// Türkçe ünsüz yumuşaması: "alacak" → "alacağımız", "borç" → "borcu". Kökten eşleşiyoruz.
const BALANCE_WORDS = /bor[çc]|bakiye|alaca[kğ]|kalan|ödedi|ödeme|tahsil|balance|owe|debt/i;
const APPOINTMENT_WORDS = /randevu|operasyon|ameliyat|appointment|surgery/i;
const WHO_WORDS = /kim|kimler|liste|listele|who|hangi/i;
const SUMMARY_WORDS = /tahsilat|gelir|gider|ciro|özet|toplam|kazanç|income|expense|summary|revenue/i;
const UNTOUCHED_WORDS =
	/temassız|dönülmedi|dönmedik|dönmedi|ihmal|sessiz kalan|unutulan|untouched|no follow-?up/i;

const CONTACT_TOKEN_RE = /\bKISI_(\d+)\b/;

function detectPeriod(text: string): MayaPeriod {
	if (/geçen ay|last month|önceki ay/i.test(text)) return 'last_month';
	if (/bu yıl|this year|yıl başından/i.test(text)) return 'this_year';
	if (/son 30 gün|son otuz gün|last 30 days/i.test(text)) return 'last_30_days';
	if (/son 7 gün|son yedi gün|bu hafta|last 7 days|this week/i.test(text)) return 'last_7_days';
	return 'this_month';
}

function detectUntouchedDays(text: string): MayaUntouchedDays {
	if (/\b90\b|doksan/i.test(text)) return 90;
	if (/\b60\b|altmış/i.test(text)) return 60;
	return 30;
}

/**
 * @param question Maskelenmiş soru (isimler `KISI_n`).
 * @param contacts Sunucunun çözdüğü kişi adayları.
 */
export function heuristicRouteMayaTool(
	question: string,
	contacts: MayaContactRef[]
): MayaToolCall | null {
	const text = question.trim();
	if (!text) return null;

	const tokenMatch = CONTACT_TOKEN_RE.exec(text);
	const contact = tokenMatch
		? (contacts.find((c) => c.token === tokenMatch[0]) ?? null)
		: null;

	// Sıra bilinçli: dar kapsamlı araçlar önce, genel özet en sonda.
	if (UNTOUCHED_WORDS.test(text)) {
		return build({ tool: 'untouchedContacts', params: { days: detectUntouchedDays(text) } });
	}

	if (contact) {
		if (APPOINTMENT_WORDS.test(text)) {
			return build({
				tool: 'contactAppointments',
				params: { contact_ref: contact.contact_ref }
			});
		}
		if (BALANCE_WORDS.test(text)) {
			return build({ tool: 'contactBalance', params: { contact_ref: contact.contact_ref } });
		}
		return null;
	}

	if (BALANCE_WORDS.test(text) && WHO_WORDS.test(text)) {
		return build({ tool: 'openBalances', params: {} });
	}

	if (SUMMARY_WORDS.test(text)) {
		return build({ tool: 'periodSummary', params: { period: detectPeriod(text) } });
	}

	return null;
}

/** Kendi çıktımızı da sözleşmeden geçiriyoruz — tek doğrulama kapısı kalsın. */
function build(candidate: unknown): MayaToolCall | null {
	const parsed = mayaToolCallSchema.safeParse(candidate);
	return parsed.success ? parsed.data : null;
}
