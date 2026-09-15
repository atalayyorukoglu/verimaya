import type { TransactionDraft } from '@verimaya/shared';

/**
 * Tutar okuma kuralları — hem kural tabanlı ayrıştırıcı hem LLM çıktısının bekçisi.
 *
 * Canlı ölçüm (2026-09-15, OrbisMed kuyruğu):
 *  - "15.09.26 12:00 zaid waldu"      → 15.092.600 TRY gider   (tarih, tutar değil)
 *  - "Sudenaz 09.09.2026 saat 21:40"   → 9.092.026 TRY          (tarih)
 *  - "@185465378484230 pazartesi…"     → 185 trilyon TRY        (WhatsApp bahsetme kimliği)
 *  - "18.200 tl personel yemekleri"    → 182 TRY                (model noktayı ondalık sandı)
 *  - "Dentgroupa 59.974 tl"            → 599,74 TRY             (aynı)
 * Ekip Türkçe yazıyor: nokta binlik ("18.200"), virgül ondalık ("16,76"), ikisi
 * birlikte "24.534,96". Kural burada tek yerde; iki yol da aynı sayıyı okusun.
 */

/** Türkçe/Avrupa yazımıyla tutar → ana birim (18.200 → 18200; 24.534,96 → 24534.96). */
export function parseTutar(raw: string): number | null {
	const s = raw.trim().replace(/\s+/g, '');
	if (!/^\d[\d.,]*$/.test(s)) return null;
	const lastDot = s.lastIndexOf('.');
	const lastComma = s.lastIndexOf(',');
	let major: string;
	let minor = '';
	if (lastDot >= 0 && lastComma >= 0) {
		// Sonda gelen ayraç ondalıktır: "24.534,96" ya da (nadir) "24,534.96".
		const dec = Math.max(lastDot, lastComma);
		major = s.slice(0, dec).replace(/[.,]/g, '');
		minor = s.slice(dec + 1);
	} else if (lastComma >= 0) {
		// Virgül: iki basamak izliyorsa ondalık ("16,76"), yoksa binlik ("1,500").
		const after = s.slice(lastComma + 1);
		if (after.length === 2 && s.indexOf(',') === lastComma) {
			major = s.slice(0, lastComma);
			minor = after;
		} else {
			major = s.replace(/,/g, '');
		}
	} else if (lastDot >= 0) {
		// Nokta: tek nokta + 1–2 basamak ondalık ("2.5"); üçlü gruplar binlik ("18.200", "1.979").
		const after = s.slice(lastDot + 1);
		const single = s.indexOf('.') === lastDot;
		if (single && after.length > 0 && after.length <= 2) {
			major = s.slice(0, lastDot);
			minor = after;
		} else {
			major = s.replace(/\./g, '');
		}
	} else {
		major = s;
	}
	if (!/^\d+$/.test(major) || (minor && !/^\d{1,2}$/.test(minor))) return null;
	const n = Number.parseFloat(minor ? `${major}.${minor}` : major);
	return Number.isFinite(n) ? n : null;
}

const TARIH = /^\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/;

/**
 * Bu sayı tutar OLAMAZ: tarih, saat, @bahsetme kimliği, telefon/kimlik gibi uzun
 * basamak dizisi, çıplak yıl. `context` metnin tamamı; token'ın önündeki karakter
 * ('@', ':') ve ardındaki (':' → saat) buradan okunur.
 */
export function tutarDegil(token: string, context: string, index: number | null = null): boolean {
	const t = token.trim();
	if (TARIH.test(t)) return true;
	if (/^\d{9,}$/.test(t.replace(/[.,]/g, ''))) return true;
	if (/^(19|20)\d{2}$/.test(t)) return true;
	const at = index ?? context.indexOf(t);
	if (at >= 0) {
		const before = context.slice(Math.max(0, at - 1), at);
		const after = context.slice(at + t.length, at + t.length + 1);
		if (before === '@' || before === ':' || after === ':') return true;
	}
	return false;
}

/** Para birimi yokken bile "bu mesaj para anlatıyor" diyebilmek için bağlam kelimeleri. */
const PARA_BAGLAMI =
	/\b(odeme|ödeme|odendi|ödendi|ucret|ücret|fiyat|tutar|prim|avans|maas|maaş|borc|borç|fatura|hakedis|hakediş|kira|taksit|tahsilat|yatir|yatır|nakit|kart|havale|dekont|indirim|bedel)/i;

export function paraBaglamiVar(text: string): boolean {
	return PARA_BAGLAMI.test(text);
}

/**
 * LLM'den gelen taslakların tutarını alıntıya göre düzeltir. Model alıntıyı doğru
 * kopyalıyor ("18.200") ama sayıya çevirirken yanılıyor (182). Alıntı tutar gibi
 * değilse (tarih, bahsetme kimliği) taslak düşer — kaynağı gösteremeyen tutar
 * kuyruğa girmez.
 */
export function tutarlariDuzelt(records: TransactionDraft[], rawText: string): TransactionDraft[] {
	const out: TransactionDraft[] = [];
	for (const r of records) {
		const quote = r.evidence?.amount?.quote?.trim();
		if (!quote) {
			out.push(r);
			continue;
		}
		// Alıntı "2.900 GBP" gibi gelebilir; sayı kısmını al.
		const num = quote.match(/\d[\d.,]*/)?.[0];
		if (!num) {
			out.push(r);
			continue;
		}
		if (tutarDegil(num, rawText, r.evidence?.amount?.start ?? null)) continue;
		const major = parseTutar(num);
		if (major == null || major <= 0) {
			out.push(r);
			continue;
		}
		const minor = Math.round(major * 100);
		out.push(minor === r.amount ? r : { ...r, amount: minor });
	}
	return out;
}
