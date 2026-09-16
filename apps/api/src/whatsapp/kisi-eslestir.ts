import { sadelestir } from './mesaj-turu';

/**
 * Bir WhatsApp mesajı HANGİ KİŞİLERDEN bahsediyor?
 *
 * KURAL TABANLI, MODEL YOK — `mesaj-turu.ts` ile aynı gerekçe: her mesajda
 * çalışır, yanılınca neden yanıldığı görülür, kural düzelince geçmiş de düzelir.
 *
 * Dersler (`scripts/ops/whatsapp-cikar.mjs` ölçümü + 2026-09-15 canlı ölçüm,
 * 11.777 mesaj):
 *  1. Ekip ad çekimli yazıyor: "Stephen McLeoda", "Karen O'Donnellden",
 *     "Aynur Tasman icin". Tam kelime eşleşmesi çoğunu kaçırır → ÖNEK eşleşmesi.
 *  2. Kayıttaki soyad alanı güvenilmez: Tracker'dan gelen kişilerde "Sarah Jennifer",
 *     "Francesca Karen", "Taksi Ücreti" gibi satırlar var; soyad tek başına
 *     eşleştirilince 2.000 bağın çoğu yanlış çıktı ("Jennifer Severino" → Sarah
 *     Jennifer). Tek-soyad kuralı bu yüzden YOK; ad + soyad ikisi de aranır.
 *  3. Kişi türü de güvenilmez ("Taksi Ücreti" Hasta). Ad+soyad kuralı yine de
 *     yalnız kişi türlerinde (Hasta, Personel) çalışır; kurum adları (otel, klinik,
 *     banka) ancak AYNEN geçerse bağlanır — "Yapı Kredi bankası" mesajı "Banka -
 *     İş Bankası"ne bağlanmasın.
 *  4. Çok kelimeli soyad ("Jane Carter") — herhangi bir kelimesi yeter, sondaki önce.
 *  5. KUCUK-01: aynı hasta gruplarda üç ayrı yazımla geçiyor — "Mccubbin /
 *     Mcgubbin / Mccgubbin", "Severino / Seberino", "Waldu / waldhu", "Haydyn /
 *     Haydn". Kural bağı kurulamadığında YAKIN EŞLEŞME denenir (`fuzzy`): ad ve
 *     soyad ikisi de yakın geçmeli, soyad ≥5 harf olmalı, sonuç tek olmalı.
 */
export type KisiAdayi = {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	contactTypeName: string;
	isInternal: boolean;
};

export type EslesmeYontemi = 'exact' | 'name' | 'fuzzy';

export type KisiEslesme = {
	contactId: string;
	method: EslesmeYontemi;
	matchedText: string;
};

const YONTEM_SIRASI: Record<EslesmeYontemi, number> = { exact: 0, name: 1, fuzzy: 2 };

/** Ad+soyad kuralının çalıştığı türler; gerisi kurum sayılır. */
const KISI_TURLERI = new Set(['hasta', 'personel']);

/** Kesme işaretini birleştir ("O'Donnell" → "odonnell"), kalan noktalamayı boşluğa çevir. */
export function kelimeler(metin: string): string[] {
	return sadelestir(metin.replace(/['’`]/g, ''))
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
}

/**
 * Metindeki kelime aranan kelimeyle eşleşir mi? Aranan ≥ 4 harfse önek yeter
 * ("mcleod" ⊂ "mcleoda"); kısaysa birebir olmalı ("ali" ≠ "alindi").
 */
function kelimeUyar(aranan: string, metindeki: string): boolean {
	if (aranan.length >= 4) return metindeki.startsWith(aranan);
	return metindeki === aranan;
}

/** Aranan kelimeler metinde ARKA ARKAYA geçiyor mu? Eşleşen parçayı döner. */
function ardArdaGeciyor(aranan: string[], metin: string[]): string | null {
	if (aranan.length === 0 || metin.length < aranan.length) return null;
	for (let i = 0; i + aranan.length <= metin.length; i++) {
		let tamam = true;
		for (let j = 0; j < aranan.length; j++) {
			if (!kelimeUyar(aranan[j], metin[i + j])) {
				tamam = false;
				break;
			}
		}
		if (tamam) return metin.slice(i, i + aranan.length).join(' ');
	}
	return null;
}

function herhangiYerdeGeciyor(aranan: string, metin: string[]): string | null {
	for (const k of metin) if (kelimeUyar(aranan, k)) return k;
	return null;
}

function kisiMi(a: KisiAdayi): boolean {
	return KISI_TURLERI.has(sadelestir(a.contactTypeName));
}

/**
 * Damerau-Levenshtein uzaklığı (bitişik harf takasını da tek hata sayar).
 *
 * Neden: aynı hasta gruplarda üç ayrı yazımla geçiyor — "Mccubbin / Mcgubbin /
 * Mccgubbin", "Severino / Seberino", "Waldu / waldhu", "Haydyn / Haydn". Bunlar
 * farklı kişiler değil, kulaktan yazılmış tek kişi. `limit` verilirse aşan
 * hesaplamalar erken kesilir.
 */
export function damerauLevenshtein(a: string, b: string, limit = Infinity): number {
	if (a === b) return 0;
	if (Math.abs(a.length - b.length) > limit) return limit + 1;
	const prev2: number[] = new Array<number>(b.length + 1).fill(0);
	let prev: number[] = new Array<number>(b.length + 1).fill(0);
	let cur: number[] = new Array<number>(b.length + 1).fill(0);
	for (let j = 0; j <= b.length; j += 1) prev[j] = j;
	let onceki2 = prev2;
	for (let i = 1; i <= a.length; i += 1) {
		cur[0] = i;
		let satirEnAz = cur[0]!;
		for (let j = 1; j <= b.length; j += 1) {
			const bedel = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(cur[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + bedel);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, onceki2[j - 2]! + 1);
			}
			cur[j] = v;
			if (v < satirEnAz) satirEnAz = v;
		}
		if (satirEnAz > limit) return limit + 1;
		const donen = onceki2;
		onceki2 = prev;
		prev = cur;
		cur = donen;
	}
	return prev[b.length]!;
}

/**
 * Kelime uzunluğuna göre kabul edilen hata payı. Kısa/yaygın soyadlarda (≤4
 * harf: "Can", "Ali", "Kaya") YALNIZ birebir — bir harf oynayınca başka bir
 * soyad oluyor. 5–7 harf bir hata, 8+ harf iki hata.
 */
function paySiniri(uzunluk: number): number {
	if (uzunluk >= 8) return 2;
	if (uzunluk >= 5) return 1;
	return 0;
}

const UNLULER = new Set(['a', 'e', 'i', 'o', 'u']);

/**
 * İki kelime arasındaki tek fark bir ÜNLÜ DEĞİŞİMİ mi? ("jones" ↔ "janes")
 *
 * Ekip ünsüz karıştırıyor ve harf ekliyor/düşürüyor: "Severino → Seberino"
 * (v↔b), "Mccubbin → Mcgubbin" (c↔g), "Waldu → Waldhu" (+h). Ünlüsü değişen ad
 * ise başka bir addır: "Jones" ile "Janes" iki ayrı hasta. Bu yüzden tek farkı
 * ünlü değişimi olan çiftler fuzzy sayılmaz.
 */
function unluDegisimi(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let fark = 0;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] === b[i]) continue;
		fark += 1;
		if (fark > 1) return false;
		if (!UNLULER.has(a[i]!) || !UNLULER.has(b[i]!)) return false;
	}
	return fark === 1;
}

/** Kelime hata payı içinde eşleşiyor mu? Eşleşiyorsa uzaklığı döner. */
function yakinUzaklik(aranan: string, metindeki: string): number | null {
	const pay = paySiniri(aranan.length);
	if (pay === 0) return aranan === metindeki ? 0 : null;
	// Uzunluk farkı payı aşıyorsa bakmaya değmez ("waldu" ↔ "waldhular").
	if (Math.abs(aranan.length - metindeki.length) > pay) return null;
	if (unluDegisimi(aranan, metindeki)) return null;
	const d = damerauLevenshtein(aranan, metindeki, pay);
	return d <= pay ? d : null;
}

/** Metinde arananın en yakın karşılığı; yoksa null. */
function metindeEnYakin(
	aranan: string,
	metin: string[]
): { kelime: string; uzaklik: number } | null {
	let best: { kelime: string; uzaklik: number } | null = null;
	for (const k of metin) {
		const d = yakinUzaklik(aranan, k);
		if (d === null) continue;
		if (!best || d < best.uzaklik) best = { kelime: k, uzaklik: d };
	}
	return best;
}

type FuzzyAday = {
	contactId: string;
	matchedText: string;
	/** Metindeki soyad kelimesi — belirsizlik bu anahtarda ölçülür. */
	soyadKelimesi: string;
	uzaklik: number;
};

/**
 * Ad+soyad ikisi de YAKIN geçiyor mu? Kural (KUCUK-01):
 *  - Kişi türü olmalı; ad ve soyad tokenleri ikisi de bulunmalı (tek soyad yetmez).
 *  - Kayıttaki soyad ≥5 harf olmalı; kısa soyadlarda yalnız birebir eşleşme.
 *  - Hata payı: 5–7 harf ≤1, 8+ harf ≤2 (Damerau-Levenshtein).
 *  - Tek farkı ünlü değişimi olan çiftler sayılmaz ("Jones" ↔ "Janes").
 */
function fuzzyAdaylari(a: KisiAdayi, metin: string[]): FuzzyAday | null {
	if (!kisiMi(a)) return null;
	const { ad, soyad } = adSoyad(a);
	if (ad.length === 0 || soyad.length === 0) return null;
	if (ad[0]!.length < 3) return null;
	const adEs = metindeEnYakin(ad[0]!, metin);
	if (!adEs) return null;
	let best: FuzzyAday | null = null;
	for (const s of [...soyad].reverse()) {
		// Kısa/yaygın soyad: fuzzy hiç açılmaz.
		if (s.length < 5) continue;
		const soyadEs = metindeEnYakin(s, metin);
		if (!soyadEs) continue;
		const uzaklik = adEs.uzaklik + soyadEs.uzaklik;
		if (uzaklik === 0) return null; // birebir; `name` kuralı zaten yakalar.
		if (!best || uzaklik < best.uzaklik) {
			best = {
				contactId: a.id,
				matchedText: `${adEs.kelime} ${soyadEs.kelime}`,
				soyadKelimesi: soyadEs.kelime,
				uzaklik
			};
		}
	}
	return best;
}

/** Ad/soyad kelimeleri: alanlar doluysa onlardan, yoksa görünen addan türetilir. */
function adSoyad(a: KisiAdayi): { ad: string[]; soyad: string[] } {
	const ad = a.firstName ? kelimeler(a.firstName) : [];
	const soyad = a.lastName ? kelimeler(a.lastName) : [];
	if (ad.length > 0 && soyad.length > 0) return { ad, soyad };
	const tumu = kelimeler(a.displayName);
	if (tumu.length >= 2) return { ad: tumu.slice(0, -1), soyad: tumu.slice(-1) };
	return { ad: tumu, soyad: [] };
}

export function kisiBul(body: string | null | undefined, adaylar: KisiAdayi[]): KisiEslesme[] {
	if (!body?.trim()) return [];
	const metin = kelimeler(body);
	if (metin.length === 0) return [];

	const sonuc = new Map<string, KisiEslesme>();
	const kaydet = (e: KisiEslesme) => {
		const eski = sonuc.get(e.contactId);
		if (!eski || YONTEM_SIRASI[e.method] < YONTEM_SIRASI[eski.method]) sonuc.set(e.contactId, e);
	};
	/** Kural bağlarının tükettiği metin kelimeleri — fuzzy onları yeniden sahiplenmesin. */
	const kesinKelimeler = new Set<string>();
	const fuzzyler: FuzzyAday[] = [];

	for (const a of adaylar) {
		const gorunen = kelimeler(a.displayName);
		if (gorunen.length === 0) continue;
		const kisi = kisiMi(a);

		// 1) Görünen ad aynen (tek kelimelik ad yalnız kurumlarda: "TNC", "Dumos").
		if (gorunen.length >= 2 || (!kisi && gorunen[0].length >= 3)) {
			const parca = ardArdaGeciyor(gorunen, metin);
			if (parca) {
				kaydet({ contactId: a.id, method: 'exact', matchedText: parca });
				for (const k of parca.split(' ')) kesinKelimeler.add(k);
				continue;
			}
		}
		if (!kisi) continue;

		// 2) Ad ve soyad ikisi de geçiyor, sıra/yer serbest ("Aynur hnm ... Tasman",
		//    "Tracey Carter" ↔ soyad "Jane Carter").
		const { ad, soyad } = adSoyad(a);
		if (ad.length === 0 || soyad.length === 0) continue;
		const adParca = ad[0].length >= 3 ? herhangiYerdeGeciyor(ad[0], metin) : null;
		let bagli = false;
		if (adParca) {
			for (const s of [...soyad].reverse()) {
				if (s.length < 3) continue;
				const soyadParca = herhangiYerdeGeciyor(s, metin);
				if (soyadParca) {
					kaydet({ contactId: a.id, method: 'name', matchedText: `${adParca} ${soyadParca}` });
					kesinKelimeler.add(adParca);
					kesinKelimeler.add(soyadParca);
					bagli = true;
					break;
				}
			}
		}
		// 3) KUCUK-01 — yakın eşleşme. Yalnız kural bağı kurulamadıysa denenir.
		if (!bagli) {
			const y = fuzzyAdaylari(a, metin);
			if (y) fuzzyler.push(y);
		}
	}

	/*
	 * Yakın eşleşme belirsizse HİÇ bağlanmaz. İki kural:
	 *  1. Metindeki soyad kelimesini kural tabanlı bir bağ zaten tüketmişse
	 *     ("Tracey Carver" kayıtlı Carver'a birebir uyuyor) yakını sayma —
	 *     yoksa aynı satır "Tracey Carter"a da bağlanırdı.
	 *  2. Aynı kelimeye birden çok kişi EN YAKIN uzaklıkta uyuyorsa hangisi
	 *     olduğu bilinmiyor demektir; kimseye bağlama, kullanıcı seçsin.
	 */
	const kelimeyeGore = new Map<string, FuzzyAday[]>();
	for (const f of fuzzyler) {
		if (kesinKelimeler.has(f.soyadKelimesi)) continue;
		const list = kelimeyeGore.get(f.soyadKelimesi) ?? [];
		list.push(f);
		kelimeyeGore.set(f.soyadKelimesi, list);
	}
	for (const list of kelimeyeGore.values()) {
		const enAz = Math.min(...list.map((f) => f.uzaklik));
		const kazananlar = list.filter((f) => f.uzaklik === enAz);
		if (kazananlar.length !== 1) continue;
		const f = kazananlar[0]!;
		kaydet({ contactId: f.contactId, method: 'fuzzy', matchedText: f.matchedText });
	}

	return [...sonuc.values()].sort((x, y) => YONTEM_SIRASI[x.method] - YONTEM_SIRASI[y.method]);
}

/**
 * Taslaktaki serbest karşı taraf adını ("Dumos Hotel") dizinde arar.
 *
 * `kisiBul` ile aynı kural; iki fark: girdi mesajın tamamı değil tek bir ad, ve
 * yalnız TEK ve KESİN sonuç kabul edilir. Belirsizse (sıfır ya da birden fazla)
 * null — taslak yanlış kişiye bağlanmaktansa boş kalır, kullanıcı seçer.
 */
export function tekKisiBul(
	label: string | null | undefined,
	adaylar: KisiAdayi[]
): KisiAdayi | null {
	const anahtar = kelimeler(label ?? '').join(' ');
	if (!anahtar) return null;
	// Önce birebir görünen ad; "Dumos Hotel" hem "Dumos"a hem "Dumos Hotel"e
	// uyduğunda tam ad kazanır.
	const tam = adaylar.filter((a) => kelimeler(a.displayName).join(' ') === anahtar);
	if (tam.length > 0) return tam.length === 1 ? tam[0] : null;
	const eslesmeler = kisiBul(label, adaylar);
	const kesin = eslesmeler.filter((e) => e.method === 'exact');
	if (kesin.length === 1) return adaylar.find((a) => a.id === kesin[0]!.contactId) ?? null;
	if (kesin.length > 1) return null;
	// KUCUK-01: birebir yoksa yakın eşleşme — "Zaid Waldhu" taslağı "Zaid Waldu"ya
	// oturur. Yine TEK sonuç şartı: `kisiBul` belirsiz yakınları zaten elemiştir.
	const yakin = eslesmeler.filter((e) => e.method === 'fuzzy');
	if (yakin.length !== 1) return null;
	return adaylar.find((a) => a.id === yakin[0]!.contactId) ?? null;
}
