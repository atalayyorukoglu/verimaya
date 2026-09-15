/**
 * "Kişi bilgisi" mesajından ad / e-posta / telefon çıkarır — yeni kişi formunu
 * doldurmak için. Kural tabanlı, tahmin yok: e-posta ve telefon kalıpla bulunur;
 * ad ancak geri kalan metin 2–4 kelimelik düz bir addan ibaretse alınır
 * ("Haydn Wright wrighthaydn@aol.com +447796287848"). Cümle içindeki adı
 * kesmeye çalışmaz — yanlış ad açmaktansa boş bırakıp kullanıcıya sormak yeğ.
 */
export type KisiBilgisi = {
	first_name: string | null;
	last_name: string | null;
	email: string | null;
	phone: string | null;
};

const EPOSTA = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const TELEFON = /(?:\+|00)?\d[\d\s().-]{7,}\d/;

function temizle(s: string): string {
	return s
		.replace(/[\s,;:|·•-]+$/g, '')
		.replace(/^[\s,;:|·•-]+/g, '')
		.trim();
}

export function kisiBilgisiCikar(body: string | null | undefined): KisiBilgisi | null {
	const text = (body ?? '').trim();
	if (!text) return null;

	const email = text.match(EPOSTA)?.[0] ?? null;
	let rest = email ? text.replace(email, ' ') : text;
	const phoneRaw = rest.match(TELEFON)?.[0] ?? null;
	const phone = phoneRaw ? phoneRaw.replace(/[\s().-]/g, '') : null;
	if (phoneRaw) rest = rest.replace(phoneRaw, ' ');

	// E-posta ya da telefon yoksa "kişi bilgisi" değil; ad tek başına yetmez.
	if (!email && !phone) return null;

	rest = temizle(rest.replace(/\s+/g, ' '));
	const words = rest.split(' ').filter(Boolean);
	const adGibi =
		words.length >= 2 && words.length <= 4 && words.every((w) => /^[\p{L}][\p{L}'’.-]*$/u.test(w));
	const first_name = adGibi ? words.slice(0, -1).join(' ') : null;
	const last_name = adGibi ? words[words.length - 1] : null;

	return { first_name, last_name, email, phone };
}
