import { sadelestir } from './mesaj-turu';

/**
 * Bir WhatsApp mesajı HANGİ KİŞİLERDEN bahsediyor?
 *
 * KURAL TABANLI, MODEL YOK — `mesaj-turu.ts` ile aynı gerekçe: her mesajda
 * çalışır, yanılınca neden yanıldığı görülür, kural düzelince geçmiş de düzelir.
 *
 * Üç ders `scripts/ops/whatsapp-cikar.mjs` ölçümünden:
 *  1. Ekip ad çekimli yazıyor: "Stephen McLeoda", "Karen O'Donnellden",
 *     "Aynur Tasman icin". Tam kelime eşleşmesi çoğunu kaçırır → ÖNEK eşleşmesi.
 *  2. Soyad tek başına ad'dan daha ayırt edici ("Tasman" tek kişi; "Aynur" değil).
 *     Ama yalnız kiracıda o soyadlı TEK kişi varsa güvenilir.
 *  3. Otel/klinik/personel adı hasta sanılmasın: tür bilgisi taşınır; tek kelimelik
 *     görünen ad yalnız kurumlarda (TNC, Dumos) kabul edilir, hastada değil.
 */
export type KisiAdayi = {
	id: string;
	displayName: string;
	firstName: string | null;
	lastName: string | null;
	contactTypeName: string;
	isInternal: boolean;
};

export type EslesmeYontemi = 'exact' | 'name' | 'surname';

export type KisiEslesme = {
	contactId: string;
	method: EslesmeYontemi;
	matchedText: string;
};

const YONTEM_SIRASI: Record<EslesmeYontemi, number> = {
	exact: 0,
	name: 1,
	surname: 2
};

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

function hastaMi(a: KisiAdayi): boolean {
	return sadelestir(a.contactTypeName) === 'hasta';
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

	// Soyad tek başına ancak kiracıda o soyadlı tek kişi varsa güvenilir.
	const soyadSayisi = new Map<string, number>();
	for (const a of adaylar) {
		const { soyad } = adSoyad(a);
		const anahtar = soyad.join(' ');
		if (anahtar) soyadSayisi.set(anahtar, (soyadSayisi.get(anahtar) ?? 0) + 1);
	}

	const sonuc = new Map<string, KisiEslesme>();
	const kaydet = (e: KisiEslesme) => {
		const eski = sonuc.get(e.contactId);
		if (!eski || YONTEM_SIRASI[e.method] < YONTEM_SIRASI[eski.method]) sonuc.set(e.contactId, e);
	};

	for (const a of adaylar) {
		const gorunen = kelimeler(a.displayName);
		if (gorunen.length === 0) continue;
		const hasta = hastaMi(a);

		// 1) Görünen ad aynen (tek kelimelik ad yalnız kurumlarda: "TNC", "Dumos").
		if (gorunen.length >= 2 || (!hasta && gorunen[0].length >= 3)) {
			const parca = ardArdaGeciyor(gorunen, metin);
			if (parca) {
				kaydet({ contactId: a.id, method: 'exact', matchedText: parca });
				continue;
			}
		}

		const { ad, soyad } = adSoyad(a);
		if (ad.length === 0 || soyad.length === 0) continue;

		// 2) Ad ve soyad ikisi de geçiyor, sıra/yer serbest ("Aynur hnm ... Tasman").
		const adParca = ad.length > 0 && ad[0].length >= 3 ? herhangiYerdeGeciyor(ad[0], metin) : null;
		const soyadParca = soyad[0].length >= 3 ? herhangiYerdeGeciyor(soyad[0], metin) : null;
		if (adParca && soyadParca) {
			kaydet({
				contactId: a.id,
				method: 'name',
				matchedText: `${adParca} ${soyadParca}`
			});
			continue;
		}

		// 3) Yalnız soyad — ≥ 5 harf, kiracıda tek, ve kişi hasta.
		if (hasta && soyadParca && soyad[0].length >= 5 && soyadSayisi.get(soyad.join(' ')) === 1) {
			kaydet({ contactId: a.id, method: 'surname', matchedText: soyadParca });
		}
	}

	return [...sonuc.values()].sort((x, y) => YONTEM_SIRASI[x.method] - YONTEM_SIRASI[y.method]);
}
