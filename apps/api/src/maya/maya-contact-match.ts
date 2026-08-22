import type { MayaContactRef } from '@verimaya/shared';
import { maskMessagePii } from '../integrations/llm/pii-mask';

/**
 * AI-11a — kişi çözümü **sunucuda** yapılır.
 *
 * Modele isim gitmediği için model "Yılmaz bey"i kendisi eşleştiremez; eşleştirseydi
 * zaten `pii-mask.ts` disiplini çiğnenirdi. Bu yüzden isim eşlemesini kod yapar, modele
 * yalnız `KISI_n` token'ı + opak UUID gider. İsim ekrana **kod** basar.
 *
 * Belirsizlik kuralı AI-02 ile aynı: aynı isim birden çok kişiye uyuyorsa **token
 * üretilmez**. Tahmin edilen kişi, cevapsızlıktan pahalıdır — yanlış hastanın bakiyesi
 * gösterilmiş olur.
 */

export type MayaContactCandidate = {
	id: string;
	displayName: string;
};

export type MayaContactMatch = MayaContactCandidate & {
	/** `KISI_1`, `KISI_2`… */
	token: string;
};

export type MayaMaskedQuestion = {
	/** Modele ve soru kaydına giden metin: isimler token, PII yer tutucu. */
	question: string;
	/** Modele giden opak liste. */
	contacts: MayaContactRef[];
	/** Yalnız sunucuda kalan token → kişi eşlemesi. */
	matches: MayaContactMatch[];
	/** Sorudaki bir isim birden çok kişiye uydu — o isim için token üretilmedi. */
	ambiguous: boolean;
};

/**
 * Soru metninde geçen ve isim olamayacak kadar sık kullanılan kelimeler. Yalnız
 * aday **sorgusunu** daraltır; gerçek eşleşme kontrolü aşağıda ayrıca yapılır.
 */
const QUESTION_STOPWORDS = new Set([
	'bey', 'hanım', 'hanim', 'bay', 'sayın', 'sayin', 'hasta', 'kişi', 'kisi',
	'ne', 'kadar', 'kim', 'kime', 'kimin', 'kimler', 'kimlerden', 'hangi', 'nasıl',
	'neden', 'nerede', 'zaman', 'için', 'icin', 'ile', 'var', 'yok', 'bir', 'bu',
	'şu', 'su', 'o', 'ben', 'biz', 'siz', 'onlar', 'daha', 'çok', 'cok', 'az',
	'borç', 'borc', 'borcu', 'borçlu', 'borclu', 'bakiye', 'alacak', 'alacağımız',
	'ödeme', 'odeme', 'ödedi', 'odedi', 'tahsilat', 'gelir', 'gider', 'toplam',
	'randevu', 'randevusu', 'randevuları', 'operasyon', 'ameliyat', 'liste',
	'listele', 'ay', 'ayda', 'gün', 'gun', 'hafta', 'yıl', 'yil', 'geçen', 'gecen',
	'son', 'bugün', 'bugun', 'yarın', 'yarin', 'dün', 'dun', 'özet', 'ozet',
	'temassız', 'temassiz', 'dönülmedi', 'donulmedi', 'ihmal', 'sessiz'
]);

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

function words(text: string): string[] {
	return text
		.toLocaleLowerCase('tr')
		.split(WORD_SPLIT)
		.filter((w) => w.length > 0);
}

/**
 * Aday kişi sorgusu için anlamlı kelimeler. Türkçe ekler yüzünden tam eşitlik
 * aranmaz; sorgu `ILIKE %kelime%` ile geniş atar, eleme `scoreCandidate`'te olur.
 */
export function contactSearchTermsFromQuestion(question: string): string[] {
	const seen = new Set<string>();
	for (const word of words(question)) {
		if (word.length < 3) continue;
		if (QUESTION_STOPWORDS.has(word)) continue;
		seen.add(word);
		if (seen.size >= 8) break;
	}
	return [...seen];
}

/** İsimden anlamlı parçalar: "Ayşe Yılmaz" → ["ayşe", "yılmaz"]. */
function nameParts(displayName: string): string[] {
	return words(displayName).filter((p) => p.length >= 3);
}

/**
 * Bir isim parçası soruda geçiyor mu?
 *
 * Türkçe ek almış hâller ("Yılmaz'ın", "Yılmazın") için önek eşlemesi kullanılır,
 * ama yalnız 4+ harfli parçalarda: 3 harfli "Ada" öneki "adam"a da uyar ve yanlış
 * kişiyi seçtirirdi. 3 harfli parçalarda tam eşitlik aranır.
 */
function partMatches(part: string, questionWords: string[]): boolean {
	if (part.length >= 4) return questionWords.some((w) => w.startsWith(part));
	return questionWords.includes(part);
}

type Scored = {
	candidate: MayaContactCandidate;
	matched: string[];
	chars: number;
};

function scoreCandidate(
	candidate: MayaContactCandidate,
	questionWords: string[]
): Scored | null {
	const matched = nameParts(candidate.displayName).filter((p) =>
		partMatches(p, questionWords)
	);
	if (matched.length === 0) return null;
	return {
		candidate,
		matched,
		chars: matched.reduce((sum, p) => sum + p.length, 0)
	};
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ek almış hâlleri de yakalayan kelime bazlı değiştirme ("Yılmaz'ın" → token). */
function replaceNamePart(text: string, part: string, replacement: string): string {
	const pattern =
		part.length >= 4
			? new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}[\\p{L}]*`, 'giu')
			: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(part)}(?![\\p{L}\\p{N}])`, 'giu');
	return text.replace(pattern, replacement);
}

/**
 * Soruyu maskeler ve modele gidecek opak kişi listesini üretir.
 *
 * @param question Kullanıcının ham sorusu.
 * @param candidates DB'den gelen aday kişiler (tenant kapsamında, silinmemiş).
 */
export function buildMayaMaskedQuestion(
	question: string,
	candidates: MayaContactCandidate[]
): MayaMaskedQuestion {
	const questionWords = words(question);
	const scored = candidates
		.map((c) => scoreCandidate(c, questionWords))
		.filter((s): s is Scored => s !== null);

	// Aynı isim parçalarına uyanlar tek grup: grup tek kişiyse token alır, çok kişiyse
	// belirsizdir ve token almaz.
	const groups = new Map<string, Scored[]>();
	for (const s of scored) {
		const key = [...s.matched].sort().join('|');
		const list = groups.get(key);
		if (list) list.push(s);
		else groups.set(key, [s]);
	}

	// Daha çok/daha uzun parça eşleşen grup önce — "Ayşe Yılmaz", yalnız "Ayşe"yi yener.
	const ordered = [...groups.entries()].sort(
		(a, b) =>
			b[1][0]!.matched.length - a[1][0]!.matched.length ||
			b[1][0]!.chars - a[1][0]!.chars
	);

	let masked = question;
	const matches: MayaContactMatch[] = [];
	let ambiguous = false;
	const consumed = new Set<string>();

	for (const [, group] of ordered) {
		const parts = group[0]!.matched;
		// Daha geniş bir eşleşme bu parçayı zaten tükettiyse tekrar maskeleme.
		if (parts.every((p) => consumed.has(p))) continue;

		if (group.length > 1) {
			ambiguous = true;
			for (const part of parts) {
				masked = replaceNamePart(masked, part, '[HASTA]');
				consumed.add(part);
			}
			continue;
		}

		const token = `KISI_${matches.length + 1}`;
		for (const part of parts) {
			masked = replaceNamePart(masked, part, token);
			consumed.add(part);
		}
		// "Ayşe Yılmaz" → "KISI_1 KISI_1" olmasın.
		masked = masked.replace(new RegExp(`(\\b${token}\\b)(\\s+\\b${token}\\b)+`, 'g'), token);
		matches.push({ ...group[0]!.candidate, token });
		if (matches.length >= 5) break;
	}

	return {
		// Son kapı: telefon/e-posta/TCKN gibi kalıpları da temizle.
		question: maskMessagePii(masked),
		contacts: matches.map((m) => ({ token: m.token, contact_ref: m.id })),
		matches,
		ambiguous
	};
}
