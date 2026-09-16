/**
 * DRIVE-01 — Drive'a yazılan ad kuralları. Saf fonksiyonlar, ağ yok, testli.
 *
 * Dosya adı: `YYYY-MM-DD-HHMM-<açıklama-slug>.<uzantı>` (tenant saat dilimi).
 * Açıklama = mesaj gövdesi/caption'ın ilk 60 karakteri; yoksa tür etiketi.
 * Türkçe karakterler ASCII'ye çevrilir — Drive her ikisini de kabul eder ama
 * dosya adı indirildiğinde, yedeklendiğinde ve aranırken ASCII sorun çıkarmaz.
 */

const TURKISH_ASCII: Record<string, string> = {
	ç: 'c',
	Ç: 'C',
	ğ: 'g',
	Ğ: 'G',
	// Noktasız ı ve noktalı İ: Unicode NFD bunları ASCII'ye indirmiyor, elle.
	ı: 'i',
	İ: 'I',
	ö: 'o',
	Ö: 'O',
	ş: 's',
	Ş: 'S',
	ü: 'u',
	Ü: 'U'
};

/** Türkçe harfleri ASCII'ye indirir, kalan aksanları Unicode NFD ile atar. */
export function toAscii(input: string): string {
	const mapped = Array.from(input)
		.map((ch) => TURKISH_ASCII[ch] ?? ch)
		.join('');
	return mapped.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** ASCII küçük harf + tire; baştaki/sondaki tireler atılır. */
export function slugify(input: string): string {
	return toAscii(input)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/** Klasör adı kişi adıdır; ASCII'ye çevrilir ve Drive'ın sevmediği karakterler atılır. */
export function folderNameFor(displayName: string): string {
	const cleaned = toAscii(displayName)
		.replace(/[\\/:*?"<>|]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned.slice(0, 120) || 'isimsiz-kisi';
}

const MIME_EXTENSIONS: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'application/pdf': 'pdf',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'video/mp4': 'mp4'
};

export function extensionFor(mimeType: string, filename: string | null): string {
	const known = MIME_EXTENSIONS[mimeType.trim().toLowerCase()];
	if (known) return known;
	const fromName = filename?.match(/\.([a-zA-Z0-9]{1,8})$/)?.[1];
	return fromName ? fromName.toLowerCase() : 'bin';
}

/** Gövdesi olmayan ek için tür etiketi. */
export function fallbackDescription(mimeType: string): string {
	return mimeType.trim().toLowerCase().startsWith('image/') ? 'whatsapp-gorsel' : 'whatsapp-belge';
}

/**
 * Tenant saat diliminde `YYYY-MM-DD-HHMM`. `Intl` kullanır: sunucu UTC'de
 * koşarken Istanbul'da 21:00 sonrası gün kaymasın (AGENTS "tarihe bağlı" kuralı).
 */
export function tenantStamp(at: Date, timezone: string): string {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: timezone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
	const hour = parts.hour === '24' ? '00' : parts.hour;
	return `${parts.year}-${parts.month}-${parts.day}-${hour}${parts.minute}`;
}

/** Açıklamanın ilk 60 karakteri slug'lanır; boşsa tür etiketi. */
export function descriptionSlug(body: string | null, mimeType: string): string {
	const slug = slugify((body ?? '').trim().slice(0, 60));
	return slug || fallbackDescription(mimeType);
}

/**
 * EVRAK-01 — belge türü biliniyorsa açıklama yerine TÜR ETİKETİ yazılır:
 * `2026-09-14-1141-visit2-consent-form.jpg`. Neden serbest başlığı değil de
 * türü: Drive klasöründe dosyalar ada göre sıralanır; tür etiketi aynı vizitin
 * aynı tür belgelerini yan yana getirir, hasta adıyla başlayan serbest başlık
 * ise zaten kişi klasöründe tekrar eden gürültüdür. Tür çıkarılamadıysa
 * (`other`/boş) eski davranış sürer: mesaj metninin ilk 60 karakteri.
 */
export function driveFileNameFor(input: {
	at: Date;
	timezone: string;
	body: string | null;
	mimeType: string;
	filename: string | null;
	docTypeSlug?: string | null;
	visitSlug?: string | null;
}): string {
	const stamp = tenantStamp(input.at, input.timezone);
	const tag = [input.visitSlug, input.docTypeSlug].filter(Boolean).join('-');
	const description = tag || descriptionSlug(input.body, input.mimeType);
	const ext = extensionFor(input.mimeType, input.filename);
	return `${stamp}-${description}.${ext}`;
}
