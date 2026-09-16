import { TRANSACTION_PAYMENT_METHODS, type TransactionDraft } from '@verimaya/shared';
import { trAnahtar } from './kategori';

/**
 * Ödeme yöntemi Finans formundaki sabit listeden gelir. Model (ve eski heuristic
 * yol) "Kart" / "Havale" / "EFT" gibi kısa biçimler yazıyordu; kart bunları
 * listede bulamayınca seçeneğe ekleyip gösteriyordu ama kayıt Finans listesindeki
 * değerden farklı kalıyordu — aynı ödeme iki ayrı yöntem gibi raporlanıyordu.
 */
const ESLESMELER: ReadonlyArray<{
	re: RegExp;
	value: (typeof TRANSACTION_PAYMENT_METHODS)[number];
}> = [
	{ re: /^(nakit|cash|elden)$/, value: 'Nakit' },
	{ re: /(kredi )?kart|card|pos\b|visa|mastercard/, value: 'Kredi Kartı' },
	{ re: /havale|eft|transfer|banka|iban|wire|swift/, value: 'Banka Havalesi/EFT' },
	{ re: /^(cek|check|cheque)$/, value: 'Çek' },
	{ re: /^(senet|bono)$/, value: 'Senet' }
];

/** Listedeki değere çevirir; tanınmayan değer olduğu gibi bırakılır (veri kaybolmasın). */
export function odemeYontemiDuzelt(value: string | null | undefined): string | null {
	const raw = (value ?? '').trim();
	if (!raw) return null;
	const key = trAnahtar(raw);
	const exact = TRANSACTION_PAYMENT_METHODS.find((m) => trAnahtar(m) === key);
	if (exact) return exact;
	for (const { re, value: canonical } of ESLESMELER) {
		if (re.test(key)) return canonical;
	}
	return raw;
}

export function odemeYontemleriniDuzelt(records: TransactionDraft[]): TransactionDraft[] {
	return records.map((r) => ({ ...r, payment_method: odemeYontemiDuzelt(r.payment_method) }));
}
