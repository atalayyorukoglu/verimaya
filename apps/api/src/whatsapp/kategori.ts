import type { TransactionDraft } from '@verimaya/shared';

/**
 * Taslak kategorisi kiracının kendi listesinden gelir.
 *
 * Neden: model prompt'ta hiçbir liste görmediği sürece ya `null` yazıyor ya da
 * kendi uydurduğu bir ad ("Hotel", "Accommodation") yazıyordu; arayüzdeki
 * Kategori kutusu tenant listesinden beslendiği için hiçbiri seçili gelmiyordu
 * ve alan boş görünüyordu. Şimdi liste modele veri olarak gidiyor, dönen değer
 * de burada listeye karşı doğrulanıyor: listede yoksa `null`.
 */
export type TenantKategori = {
	kind: TransactionDraft['kind'];
	name: string;
	subcategories: string[];
};

/**
 * Karşılaştırma anahtarı: Türkçe küçük harf + aksan/noktasız i düzleştirme.
 * "Saç ekimi" ≡ "sac ekimi" ≡ "SAÇ EKİMİ" — model hangi biçimde yazarsa yazsın
 * aynı kategoriye düşsün.
 */
export function trAnahtar(value: string): string {
	return value
		.toLocaleLowerCase('tr')
		.replace(/ı/g, 'i')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

/** Türe uyan kategoriler; kategori adı türle birlikte benzersiz. */
function kindKategorileri(categories: TenantKategori[], kind: TransactionDraft['kind']) {
	return categories.filter((c) => c.kind === kind);
}

/**
 * Modelin yazdığı adı kiracı listesindeki kanonik ada çevirir.
 * Önce birebir (normalize) eşleşme, sonra tek sonuçlu içerme ("otel" → "Konaklama"
 * DEĞİL; "konaklama gideri" → "Konaklama"). Belirsizse null — tahmin üretilmez.
 */
export function kategoriEsle(
	categories: TenantKategori[],
	kind: TransactionDraft['kind'],
	name: string | null | undefined
): string | null {
	const key = trAnahtar(name ?? '');
	if (!key) return null;
	const list = kindKategorileri(categories, kind);
	const exact = list.find((c) => trAnahtar(c.name) === key);
	if (exact) return exact.name;
	const contains = list.filter((c) => {
		const k = trAnahtar(c.name);
		return k.includes(key) || key.includes(k);
	});
	return contains.length === 1 ? contains[0].name : null;
}

/** Alt kategori yalnız seçili kategorinin listesinden; listede yoksa null. */
export function altKategoriEsle(
	categories: TenantKategori[],
	kind: TransactionDraft['kind'],
	categoryName: string | null,
	sub: string | null | undefined
): string | null {
	const key = trAnahtar(sub ?? '');
	if (!key || !categoryName) return null;
	const cat = kindKategorileri(categories, kind).find((c) => c.name === categoryName);
	if (!cat) return null;
	const exact = cat.subcategories.find((s) => trAnahtar(s) === key);
	if (exact) return exact;
	const contains = cat.subcategories.filter((s) => {
		const k = trAnahtar(s);
		return k.includes(key) || key.includes(k);
	});
	return contains.length === 1 ? contains[0] : null;
}

/**
 * Anahtar kelime → kategori adayı. Sabit ad YAZMAZ: adayı kiracı listesinde arar,
 * bulamazsa null döner. Eskiden heuristic yol körlemesine 'Operasyon' / 'Konaklama'
 * / 'Pazarlama' yazıyordu — kiracıda o adla kategori yoksa arayüzde boş görünüyordu.
 */
const KATEGORI_IPUCLARI: ReadonlyArray<{ re: RegExp; adaylar: string[] }> = [
	{ re: /otel|hotel|konaklama|check[- ]?in|gecelik|ekstra gece/i, adaylar: ['Konaklama'] },
	{ re: /transfer|havaliman|havalimanı|vip araç|şoför|sofor|pickup/i, adaylar: ['Transfer'] },
	{
		re: /reklam|ads\b|pazarlama|ajans|meta|instagram|google ads|influencer/i,
		adaylar: ['Pazarlama']
	},
	{
		re: /operasyon|ameliyat|saç ekim|sac ekim|implant|klinik|konsültasyon|konsultasyon|tedavi|greft/i,
		adaylar: ['Operasyon']
	}
];

export function kategoriTahmin(
	text: string,
	kind: TransactionDraft['kind'],
	categories: TenantKategori[]
): string | null {
	if (categories.length === 0) return null;
	for (const { re, adaylar } of KATEGORI_IPUCLARI) {
		if (!re.test(text)) continue;
		for (const aday of adaylar) {
			const eslesen = kategoriEsle(categories, kind, aday);
			if (eslesen) return eslesen;
		}
	}
	return null;
}

/**
 * Sunucu bekçisi: taslaklardaki kategori/alt kategori kiracı listesine çekilir.
 * Kiracıda hiç kategori yoksa (liste boş) dokunulmaz — aksi hâlde model doğru
 * yazsa bile her şey null'a düşerdi.
 */
export function kategorileriDuzelt(
	records: TransactionDraft[],
	categories: TenantKategori[]
): TransactionDraft[] {
	if (categories.length === 0) return records;
	return records.map((r) => {
		const category = kategoriEsle(categories, r.kind, r.category);
		return {
			...r,
			category,
			subcategory: altKategoriEsle(categories, r.kind, category, r.subcategory)
		};
	});
}

/** Model prompt'una giden liste — `{kind, name, subcategories}`, kiracı sırasıyla. */
export function kategoriPromptVerisi(categories: TenantKategori[]): TenantKategori[] {
	return categories.map((c) => ({
		kind: c.kind,
		name: c.name,
		subcategories: c.subcategories
	}));
}
