import type { ContactVisitDraft, ContactVisitType } from '@verimaya/shared';

/**
 * VIZIT-01 — mesaj metninden vizit taslağı çıkarır. **Saf fonksiyon**: DB yok,
 * model yok, yan etki yok; aynı girdi her zaman aynı çıktıyı verir.
 *
 * Kaynak kalıplar `docs/whatsapp-01`'deki gerçek mesajlar:
 *   "Zaid waldu, ikinci vizit / Geliş: 13.09.2026 21:35 / Dönüş: 19.09.2026 22:15"
 *   "Jennifer Severino,rpt / Geliş: 06.09.2026 15.00 / Dönüş: 10.09.2026 22.15"
 *   "Frankie Simpson Alt üst all on 4 Geliş: 03.03.2025 17.30 Dönüş: 07.03.2025 23.45"
 *   "Zaid Waldu / Gelis: 19 Ekim 20:35 2025 / Dönüş: 24 Ekim 21:00 2025"
 *   "Lisa Gumersell / 17.09.2026 20:35 ucak inis saati / 24.09.2026 09:35 ucak kalkis saati"
 *   "Jacek Wyszynski 2.ci vizit. 26 nisan gelis tarihi 2 mayis donus tarihi."
 *
 * Çıktı **taslaktır**: kuyruğa öneri olarak düşer, insan onaylayınca vizit olur.
 * Tahmin yok — kalıp yoksa `null` döner; eksik alan `null` kalır, uydurulmaz.
 */

/** Türkçe harfleri sadeleştirip küçültür; uzunluk birebir korunur (indeksler kayamaz). */
const TR_SADE: Record<string, string> = {
	İ: 'i',
	I: 'ı',
	ı: 'i',
	Ş: 's',
	ş: 's',
	Ğ: 'g',
	ğ: 'g',
	Ü: 'u',
	ü: 'u',
	Ö: 'o',
	ö: 'o',
	Ç: 'c',
	ç: 'c',
	Â: 'a',
	â: 'a'
};

export function sadelestir(text: string): string {
	let out = '';
	for (const ch of text) {
		const mapped = TR_SADE[ch] ?? ch.toLowerCase();
		out += mapped.length === 1 ? mapped : ch;
	}
	return out;
}

const AYLAR: Record<string, number> = {
	ocak: 0,
	subat: 1,
	mart: 2,
	nisan: 3,
	mayis: 4,
	haziran: 5,
	temmuz: 6,
	agustos: 7,
	eylul: 8,
	ekim: 9,
	kasim: 10,
	aralik: 11
};
const AY_ADLARI = Object.keys(AYLAR).join('|');

type TarihAdayi = {
	start: number;
	end: number;
	/** UTC epoch ms. Saat bilinmiyorsa günün 00:00'ı. */
	ms: number;
	timeKnown: boolean;
	/** Yıl metinde yazılı mıydı? Değilse mesaj tarihine göre ileri yuvarlanır. */
	yearGiven: boolean;
	day: number;
	month: number;
	year: number;
	hour: number;
	minute: number;
};

function gecerliGun(year: number, month: number, day: number): boolean {
	const d = new Date(Date.UTC(year, month, day));
	return d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day;
}

function aday(
	start: number,
	end: number,
	day: number,
	month: number,
	year: number,
	hour: number | null,
	minute: number | null,
	yearGiven: boolean
): TarihAdayi | null {
	if (!gecerliGun(year, month, day)) return null;
	const h = hour ?? 0;
	const m = minute ?? 0;
	if (h > 23 || m > 59) return null;
	return {
		start,
		end,
		ms: Date.UTC(year, month, day, h, m),
		timeKnown: hour !== null,
		yearGiven,
		day,
		month,
		year,
		hour: h,
		minute: m
	};
}

/**
 * Yıl yazılmamışsa mesaj tarihine göre **ileriye** yuvarlanır: "26 nisan" 18 Mart
 * 2026'da yazıldıysa 2026 Nisan'dır; 20 Aralık'ta yazıldıysa 2027 Nisan'dır.
 * Eşik 30 gün geri: aynı mesajda "dün indi" gibi yakın geçmiş kırpılmasın.
 */
function yiliYuvarla(day: number, month: number, referans: Date): number {
	const ref = referans.getTime();
	const yil = referans.getUTCFullYear();
	for (const y of [yil - 1, yil, yil + 1]) {
		if (!gecerliGun(y, month, day)) continue;
		const t = Date.UTC(y, month, day);
		if (t >= ref - 30 * 24 * 3600 * 1000) return y;
	}
	return yil;
}

/** Metindeki bütün tarih adaylarını konumlarıyla toplar. */
export function tarihleriBul(text: string, messageDate: Date): TarihAdayi[] {
	const norm = sadelestir(text);
	const out: TarihAdayi[] = [];

	// 13.09.2026 21:35 · 03.03.2025 17.30 · 5/9/2025
	const sayisal = /(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s*(?:saat:?\s*)?(\d{1,2})[:.](\d{2}))?/g;
	for (const m of norm.matchAll(sayisal)) {
		const c = aday(
			m.index,
			m.index + m[0].length,
			Number(m[1]),
			Number(m[2]) - 1,
			Number(m[3]),
			m[4] === undefined ? null : Number(m[4]),
			m[5] === undefined ? null : Number(m[5]),
			true
		);
		if (c) out.push(c);
	}

	// 23 Şubat 2025 19.25 · 13 Eylül 21:35 · 19 Ekim 20:35 2025 · 4 Ekim
	const adli = new RegExp(
		`(\\d{1,2})\\s*(${AY_ADLARI})\\b(?:\\s*(\\d{4}))?(?:\\s*(?:saat:?\\s*)?(\\d{1,2})[:.](\\d{2}))?(?:\\s*(\\d{4}))?`,
		'g'
	);
	for (const m of norm.matchAll(adli)) {
		const month = AYLAR[m[2]!]!;
		const yazili = m[3] ?? m[6];
		const year = yazili ? Number(yazili) : yiliYuvarla(Number(m[1]), month, messageDate);
		const c = aday(
			m.index,
			m.index + m[0].length,
			Number(m[1]),
			month,
			year,
			m[4] === undefined ? null : Number(m[4]),
			m[5] === undefined ? null : Number(m[5]),
			yazili !== undefined
		);
		if (c) out.push(c);
	}

	out.sort((a, b) => a.start - b.start);
	// Üst üste binen adaylar (sayısal + adlı aynı yeri yakalarsa) ilkine bırakılır.
	return out.filter((c, i) => i === 0 || c.start >= out[i - 1]!.end);
}

type Etiket = { start: number; end: number; yon: 'arrival' | 'departure' };

/**
 * "Geliş / varış / iniş" ve "dönüş / gidiş / kalkış". Etiket tarihten önce de
 * sonra da gelebiliyor: "Geliş: 13.09.2026" ama "17.09.2026 ucak inis saati" ve
 * "26 nisan gelis tarihi".
 */
function etiketleriBul(norm: string): Etiket[] {
	const out: Etiket[] = [];
	const re = /(?<![a-zı0-9])(gelis|varis|inis|donus|gidis|kalkis)/g;
	for (const m of norm.matchAll(re)) {
		const kelime = m[1]!;
		out.push({
			start: m.index,
			end: m.index + kelime.length,
			yon: kelime === 'gelis' || kelime === 'varis' || kelime === 'inis' ? 'arrival' : 'departure'
		});
	}
	return out;
}

/**
 * Etiket ile tarih arasındaki "gerçek" uzaklık: aradaki noktalama ve boşluk
 * sayılmaz. "Geliş: 13.09.2026" ile "13.09.2026\nDönüş" aynı yakınlıkta durur,
 * yön farkı ayrı bir ölçüt olur.
 */
function anlamliBosluk(norm: string, from: number, to: number): number {
	if (to <= from) return 0;
	let n = 0;
	for (let i = from; i < to; i += 1) {
		if (!/[\s:.,\-–—()/]/.test(norm[i]!)) n += 1;
	}
	return n;
}

/** Bu kadar anlamlı karakterden uzaktaki tarih o etikete ait sayılmaz. */
const MAX_BOSLUK = 24;

function eslestir(
	norm: string,
	etiketler: Etiket[],
	tarihler: TarihAdayi[]
): { arrival: TarihAdayi | null; departure: TarihAdayi | null } {
	type Cift = { etiket: Etiket; tarih: TarihAdayi; bosluk: number; sonra: 0 | 1 };
	const ciftler: Cift[] = [];
	for (const e of etiketler) {
		for (const t of tarihler) {
			const sonra = t.start >= e.end;
			const bosluk = sonra
				? anlamliBosluk(norm, e.end, t.start)
				: anlamliBosluk(norm, t.end, e.start);
			if (bosluk > MAX_BOSLUK) continue;
			// Etiketten SONRA gelen tarih ("Geliş: 13.09.2026") baskın kalıp; eşitlikte o
			// kazanır. Önce gelen de geçerli ("26 nisan gelis", "… ucak inis saati").
			ciftler.push({ etiket: e, tarih: t, bosluk, sonra: sonra ? 0 : 1 });
		}
	}
	ciftler.sort((a, b) => a.bosluk - b.bosluk || a.sonra - b.sonra || a.tarih.start - b.tarih.start);

	let arrival: TarihAdayi | null = null;
	let departure: TarihAdayi | null = null;
	const kullanilan = new Set<number>();
	for (const c of ciftler) {
		if (kullanilan.has(c.tarih.start)) continue;
		if (c.etiket.yon === 'arrival' && !arrival) {
			arrival = c.tarih;
			kullanilan.add(c.tarih.start);
		} else if (c.etiket.yon === 'departure' && !departure) {
			departure = c.tarih;
			kullanilan.add(c.tarih.start);
		}
	}

	// Etiket yok ama tam iki tarih var: ilki geliş, ikincisi dönüş.
	if (!arrival && !departure && tarihler.length === 2) {
		arrival = tarihler[0]!;
		departure = tarihler[1]!;
	}
	// Dönüş gelişten önceyse bağ yanlış kurulmuştur — dönüşü boş bırak, uydurma.
	if (arrival && departure && departure.ms < arrival.ms) departure = null;
	return { arrival, departure };
}

/** "2.ci vizit", "ikinci vizit", "visit 2", "2nd visit", "rpt", "konsültasyon". */
export function vizitTuruBul(norm: string): { type: ContactVisitType; sequence: number | null } {
	if (/(?<![a-zı])rpt(?![a-zı])|revizyon/.test(norm)) return { type: 'rpt', sequence: null };
	if (/konsultasyon|consultation/.test(norm)) return { type: 'consultation', sequence: null };

	const YAZI: Record<string, number> = {
		ilk: 1,
		birinci: 1,
		first: 1,
		ikinci: 2,
		second: 2,
		ucuncu: 3,
		third: 3
	};
	const yazi = norm.match(
		/(ilk|birinci|first|ikinci|second|ucuncu|third)\s*(?:ci|nci|inci)?\s*(vizit|visit)/
	);
	if (yazi) {
		const n = YAZI[yazi[1]!]!;
		return { type: `visit_${n}` as ContactVisitType, sequence: n };
	}

	// "2.ci vizit", "2. vizit", "2.visit", "2nd visit", "visit 2", "vizit 3"
	const rakam =
		norm.match(/(\d)\s*(?:\.|nd|rd|st|th)?\s*(?:ci|cu|nci|ncu)?\s*(?:vizit|visit)/) ??
		norm.match(/(?:vizit|visit)\s*(\d)/);
	if (rakam) {
		const n = Number(rakam[1]);
		if (n >= 1 && n <= 3) return { type: `visit_${n}` as ContactVisitType, sequence: n };
		if (n > 3) return { type: 'other', sequence: n };
	}
	return { type: 'other', sequence: null };
}

/**
 * "1 std twin bed Cedrus Hotel", "Leaf River Suites hotel 1 pax",
 * "City Live Hotel olarak revize edildi" → otel adı (Hotel/otel sözcüğü olmadan).
 * Yalnız büyük harfle başlayan sözcük dizisi alınır; "bed", "std" gibi küçük
 * harfli sıfatlar dışarıda kalır.
 */
export function otelBul(text: string): string | null {
	// `i` bayrağı YOK: `\p{Lu}` ile birlikte kullanılırsa küçük harfleri de yakalar
	// ve "1 std twin bed Cedrus Hotel" → "twin bed Cedrus" olurdu.
	const re =
		/((?:[\p{Lu}][\p{L}&'’.-]*|\d{2,3})(?:\s+(?:[\p{Lu}][\p{L}&'’.-]*|\d{2,3})){0,2})\s+(?:[Hh]otel|HOTEL|[Oo]tel|OTEL)\b/gu;
	let best: string | null = null;
	for (const m of text.matchAll(re)) {
		const ad = m[1]!.trim();
		if (!/\p{L}/u.test(ad)) continue;
		best = ad;
	}
	return best;
}

/** Klinik ortakları — grup adından ya da metinden. */
const KLINIKLER: Array<[RegExp, string]> = [
	[/dentgroup/i, 'Dentgroup'],
	[/(?<![a-z])tnc(?![a-z])/i, 'TNC'],
	[/(?<![a-z])ogn(?![a-z])/i, 'OGN'],
	[/(?<![a-z])dds(?![a-z])/i, 'DDS'],
	[/(?<![a-z])vega(?![a-z])/i, 'Vega']
];

export function klinikBul(text: string, chatName?: string | null): string | null {
	for (const kaynak of [chatName ?? '', text]) {
		for (const [re, ad] of KLINIKLER) {
			if (re.test(kaynak)) return ad;
		}
	}
	return null;
}

/** "Selin hocada", "Eren Hoca", "Dr. Bora" → hekim adı. */
export function hekimBul(text: string): string | null {
	const hoca = text.match(/([\p{Lu}][\p{Ll}]{2,})\s+hoca/u);
	if (hoca) return hoca[1]!;
	const dr = text.match(/\bDr\.?\s+([\p{Lu}][\p{Ll}]{2,})/u);
	if (dr) return dr[1]!;
	return null;
}

const TEDAVI_IPUCU =
	/(all[\s-]?on[\s-]?\d|allon\d|zigoma|zygomatic|zirkon|zirconia|implant|kron|crown|lamine|veneer|plak|night\s?guard|gece\s?pla[gğ]|kanal|dolgu|beyazlat|detertraj|botoks|titanyum\s?bar|protez|kaplama|tarama)/i;

/** Satır sonlarında duran kalıp sözler — plana girmemeli. */
const PLAN_TEMIZLE =
	/(randevusunun|rezervasyonunun|randevu|rezervasyon)[^\n]*$|ucak\s+(inis|kalkis)\s+saati|geli[şs]\s*:?.*$|d[öo]n[üu][şs]\s*:?.*$/gi;

/**
 * Tedavi planı: tedavi sözcüğü geçen satır, kalıp sözlerden ve tarihlerden
 * arındırılmış hali. Bulunamazsa null — mesajın tamamını plan diye yazmaktansa boş bırak.
 */
export function tedaviPlaniBul(text: string): string | null {
	const satirlar = text.split(/\n+/);
	for (const satir of satirlar) {
		if (!TEDAVI_IPUCU.test(satir)) continue;
		const temiz = satir
			.replace(PLAN_TEMIZLE, ' ')
			.replace(/\d{1,2}[./]\d{1,2}[./]\d{4}(\s+\d{1,2}[:.]\d{2})?/g, ' ')
			.replace(/[.,;:]\s*$/, '')
			.replace(/\s{2,}/g, ' ')
			.trim();
		if (temiz.length >= 4) return temiz.slice(0, 300);
	}
	return null;
}

/** Bu mesaj gerçekten bir vizit/randevu talebi mi? */
const TALEP_IPUCU =
	/(randevusunun|rezervasyonunun)\s+olusturulmasini|randevu\s+olusturul|rica\s+ederim|randevu\s+talebi/;
const VIZIT_IPUCU = /(?<![a-zı])(rpt|vizit|visit|konsultasyon|consultation)(?![a-zı])/;

export type VizitCikarGirdi = {
	text: string;
	/** Mesajın geldiği an — yıl yazılmamış tarihler buna göre ileri yuvarlanır. */
	messageDate?: Date | string | null;
	/** Grup adı; klinik buradan da okunabilir (TNC / Dentgroup). */
	chatName?: string | null;
};

export type VizitCikarSonuc = {
	draft: ContactVisitDraft;
	confidence: 'high' | 'medium';
};

export function vizitCikar(girdi: VizitCikarGirdi): VizitCikarSonuc | null {
	const text = girdi.text ?? '';
	if (text.trim().length === 0) return null;
	const referans =
		girdi.messageDate instanceof Date
			? girdi.messageDate
			: girdi.messageDate
				? new Date(girdi.messageDate)
				: new Date();
	const messageDate = Number.isNaN(referans.getTime()) ? new Date() : referans;

	const norm = sadelestir(text);
	const talepVar = TALEP_IPUCU.test(norm);
	const vizitVar = VIZIT_IPUCU.test(norm);
	const etiketler = etiketleriBul(norm);

	// Ne talep kalıbı, ne vizit sözcüğü, ne geliş/dönüş etiketi → bu mesaj vizit değil.
	if (!talepVar && !vizitVar && etiketler.length === 0) return null;

	const tarihler = tarihleriBul(text, messageDate);
	const { arrival, departure } = eslestir(norm, etiketler, tarihler);
	// Tarihsiz vizit önerisi kullanıcıya iş çıkarır, bilgi vermez.
	if (!arrival && !departure) return null;

	const { type, sequence } = vizitTuruBul(norm);

	const draft: ContactVisitDraft = {
		visit_type: type,
		sequence,
		arrival_at: arrival ? new Date(arrival.ms).toISOString() : null,
		arrival_time_known: arrival ? arrival.timeKnown : false,
		departure_at: departure ? new Date(departure.ms).toISOString() : null,
		departure_time_known: departure ? departure.timeKnown : false,
		hotel: otelBul(text),
		clinic: klinikBul(text, girdi.chatName),
		doctor: hekimBul(text),
		treatment_plan: tedaviPlaniBul(text)
	};

	/*
	 * Yüksek güven: iki tarih de var, en az biri etiketle bağlanmış ve mesaj ya
	 * talep kalıbı ya da açık vizit sözcüğü taşıyor. Gerisi orta güven — kart yine
	 * açılır ama kullanıcı daha dikkatli baksın.
	 */
	const confidence: 'high' | 'medium' =
		arrival && departure && etiketler.length > 0 && (talepVar || vizitVar) ? 'high' : 'medium';

	return { draft, confidence };
}
