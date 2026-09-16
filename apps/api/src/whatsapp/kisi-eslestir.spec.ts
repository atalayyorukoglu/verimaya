import { describe, expect, it } from 'vitest';
import { kelimeler, kisiBul, tekKisiBul, type KisiAdayi } from './kisi-eslestir';

/** Örnekler gerçek gruplardan; şapkasız, ekli, noktalaması düzensiz. */
const hasta = (id: string, first: string, last: string): KisiAdayi => ({
	id,
	displayName: `${first} ${last}`,
	firstName: first,
	lastName: last,
	contactTypeName: 'Hasta',
	isInternal: false
});
const kurum = (id: string, ad: string, tur: string): KisiAdayi => ({
	id,
	displayName: ad,
	firstName: null,
	lastName: null,
	contactTypeName: tur,
	isInternal: false
});

const adaylar: KisiAdayi[] = [
	hasta('claire', 'Claire', 'McLeod'),
	hasta('stephen', 'Stephen', 'McLeod'),
	hasta('karen', 'Karen', "O'Donnell"),
	hasta('aynur', 'Aynur', 'Taşman'),
	hasta('tracey', 'Tracey', 'Jane Carter'),
	hasta('ali', 'Ali', 'Can'),
	// Tracker'dan gelen bozuk satırlar — soyad alanı aslında ad, tür yanlış.
	hasta('sarah', 'Sarah', 'Jennifer'),
	hasta('taksi', 'Taksi', 'Ücreti'),
	kurum('tnc', 'TNC', 'Klinik'),
	kurum('dumos', 'Dumos', 'Otel'),
	kurum('self', 'Self', 'Otel'),
	kurum('isbank', 'Banka - İş Bankası', 'Banka'),
	{
		id: 'gulcin',
		displayName: 'Gülçin Özer',
		firstName: 'Gülçin',
		lastName: 'Özer',
		contactTypeName: 'Personel',
		isInternal: true
	}
];

const idler = (body: string) => kisiBul(body, adaylar).map((e) => e.contactId);

describe('kelimeler', () => {
	it('kesme işaretini birleştirir, noktalamayı atar, Türkçeyi sadeleştirir', () => {
		expect(kelimeler("Karen O'Donnell'den 360 Gbp.")).toEqual([
			'karen',
			'odonnellden',
			'360',
			'gbp'
		]);
		expect(kelimeler('Aynur Taşman için')).toEqual(['aynur', 'tasman', 'icin']);
	});
});

describe('kisiBul — tam ad', () => {
	it('görünen ad aynen geçince exact', () => {
		const [e] = kisiBul(
			'Claire McLeod Stephen McLeod Leaf River Suites otel 26.815,32 tl.',
			adaylar
		);
		expect(e.method).toBe('exact');
		expect(idler('Claire McLeod Stephen McLeod Leaf River Suites otel 26.815,32 tl.')).toEqual([
			'claire',
			'stephen'
		]);
	});

	it('ek almış soyadı yakalar ("McLeoda", "Odonnellden")', () => {
		expect(idler('Stephen McLeoda dis tasi temizligi yapildi. + 100 gbp daha alinacak.')).toEqual([
			'stephen'
		]);
		expect(idler("360 Gbp Karen O'Donnellden kalan cerrahi islem ödemesi")).toEqual(['karen']);
	});

	it('şapkasız yazımı eşler ("Tasman" = "Taşman")', () => {
		expect(idler('Aynur Tasman icin Tnc hakedis 1.979,56 Gbp')).toEqual(['aynur', 'tnc']);
	});

	it('kurum adı tek kelime olsa da eşleşir', () => {
		expect(idler('91.150 tl karsiliginda Tnc ye 1400 Gbp odendi.')).toEqual(['tnc']);
		expect(idler("Karen O'Donnell Dumos Hotel konaklama faturasi 25.217,25 tl.")).toEqual([
			'karen',
			'dumos'
		]);
	});
});

describe('kisiBul — ad + soyad ayrı yerlerde', () => {
	it('ikisi de geçiyorsa name', () => {
		const [e] = kisiBul('Aynur hnm adina 2.900 euro yatirildi, Tasman dosyasi.', adaylar);
		expect(e).toMatchObject({ contactId: 'aynur', method: 'name' });
	});

	it('çok kelimeli soyadın herhangi bir kelimesi yeter ("Jane Carter" ↔ "Tracey Carter")', () => {
		expect(idler('Tracey Carter, alt çenesine 9 kron yapılacak.')).toEqual(['tracey']);
	});

	it('personel de bağlanır — maaş mesajı kişinin akışına düşmeli', () => {
		expect(idler('Gulcin Ozer Agustos 2026 Maas hakedisi odendi. 90.000 tl')).toEqual(['gulcin']);
	});
});

describe('kisiBul — yanlış pozitif kapıları', () => {
	it('yalnız soyad bağlamaz — kayıttaki soyad alanı güvenilmez', () => {
		expect(idler('Tasman klinik costu 2.261,42 Gbp kadar edecek.')).toEqual([]);
		expect(idler('Jennifer Severino Cedrus Hotel konaklama faturasi 21.526,49 tl.')).toEqual([]);
		expect(idler('90.000 tl + 16,76 tl islem ucreti.')).toEqual([]);
	});

	it('iki kişide olan soyad tek başına bağlamaz (McLeod)', () => {
		expect(idler('McLeod borcumuzdan dusulecektir.')).toEqual([]);
	});

	it('kısa ad başka kelimenin içinde sayılmaz ("ali" ≠ "alindi")', () => {
		expect(idler('4100 gbp nakit alindi. Yanlis yazildi.')).toEqual([]);
		expect(idler('Can gelmedi.')).toEqual([]);
	});

	it('kurum adı yalnız aynen geçince bağlanır ("Yapı Kredi bankası" ≠ İş Bankası)', () => {
		expect(idler('Yapı kredi bankası kart ödemesi')).toEqual([]);
		expect(idler('Banka - İş Bankası kredi kartına 14.650 tl ödendi')).toEqual(['isbank']);
	});

	it('hasta olmayan tek kelimelik ad İngilizce cümlede yakalanmaz ("Self")', () => {
		expect(idler('I did it by myself, no hotel needed.')).toEqual([]);
	});

	it('boş ve medya-only mesajda boş döner', () => {
		expect(kisiBul('', adaylar)).toEqual([]);
		expect(kisiBul(null, adaylar)).toEqual([]);
	});
});

describe('tekKisiBul — taslaktaki karşı taraf adı', () => {
	it('tek ve kesin eşleşmede kişiyi döner ("Dumos Hotel")', () => {
		expect(tekKisiBul('Dumos Hotel', adaylar)?.id).toBe('dumos');
	});

	it('belirsiz ya da bulunamayan adda null — yanlış kişiye bağlanmaz', () => {
		expect(tekKisiBul('Bilinmeyen Firma', adaylar)).toBeNull();
		expect(tekKisiBul('', adaylar)).toBeNull();
		expect(tekKisiBul(null, adaylar)).toBeNull();
	});
});

/**
 * KUCUK-01 — yakın eşleşme (`fuzzy`).
 *
 * Evrak/Rezervasyon gruplarında aynı hasta birden çok yazımla geçiyor. Örnekler
 * `docs/whatsapp-01`'deki gerçek satırlardan: "Claire Mccubbin" ↔ "Mcgubbin" ↔
 * "Mccgubbin", "Haydn Wright" ↔ "Haydyn", "Jennifer Severino" ↔ "Seberino",
 * "Zaid Waldu" ↔ "waldhu".
 */
describe('kisiBul — yakın eşleşme (fuzzy)', () => {
	const fz: KisiAdayi[] = [
		hasta('mccubbin', 'Claire', 'Mccubbin'),
		hasta('haydn', 'Haydn', 'Wright'),
		hasta('severino', 'Jennifer', 'Severino'),
		hasta('waldu', 'Zaid', 'Waldu'),
		hasta('mcleod', 'Stephen', 'McLeod'),
		hasta('jones', 'Paul', 'Jones'),
		hasta('ali', 'Ali', 'Can')
	];
	const es = (body: string) => kisiBul(body, fz);

	it('soyad yazımı kayınca bağlar, yöntem fuzzy olur', () => {
		expect(es('Claire Mcgubbin RPT')).toEqual([
			{ contactId: 'mccubbin', method: 'fuzzy', matchedText: 'claire mcgubbin' }
		]);
		expect(es('Claire Mccgubbin RPT')[0]).toMatchObject({
			contactId: 'mccubbin',
			method: 'fuzzy'
		});
		expect(es('Jennifer Seberino RPT Amber ile geliyor.')[0]).toMatchObject({
			contactId: 'severino',
			method: 'fuzzy'
		});
		expect(es('Zaid waldhu 2.ci vizit')[0]).toMatchObject({ contactId: 'waldu', method: 'fuzzy' });
	});

	it('ad yazımı kayınca da bağlar ("Haydyn" ↔ "Haydn")', () => {
		expect(es('Haydyn Wright rezervasyon rica ederim')[0]).toMatchObject({
			contactId: 'haydn',
			method: 'fuzzy'
		});
	});

	it('yalnız büyük/küçük harf farkı fuzzy değil, exact kalır ("Mcleod" = "McLeod")', () => {
		expect(es('Stephen Mcleod dis tasi temizligi')[0]).toMatchObject({
			contactId: 'mcleod',
			method: 'exact'
		});
	});

	it('ünlü değişimi bağlamaz ("Jones" ↔ "Janes" iki ayrı hasta)', () => {
		expect(es('Paul Janes icin randevu')).toEqual([]);
	});

	it('kısa soyadda yalnız birebir ("Can" ↔ "Cen" bağlanmaz)', () => {
		expect(es('Ali Cen geldi')).toEqual([]);
	});

	it('soyadın yalnız kendisi yakınsa bağlamaz — ad da geçmeli', () => {
		expect(es('Mcgubbin borcumuzdan dusulecek')).toEqual([]);
	});

	it('birebir eşleşen kişi varsa aynı kelime ikinci kişiye yakın diye bağlanmaz', () => {
		// "Carter" ↔ "Carver" 6 harf, uzaklık 1; ama Carver kayıtlı ve birebir geçiyor.
		const iki = [...fz, hasta('carter', 'Tracey', 'Carter'), hasta('carver', 'Tracey', 'Carver')];
		expect(kisiBul('Tracey Carver 9 kron yapilacak', iki)).toEqual([
			{ contactId: 'carver', method: 'exact', matchedText: 'tracey carver' }
		]);
	});

	it('iki aday aynı uzaklıkta ise hiçbirine bağlanmaz', () => {
		const iki = [...fz, hasta('carter', 'Tracey', 'Carter'), hasta('carver', 'Tracey', 'Carver')];
		expect(kisiBul('Tracey Carler geldi', iki)).toEqual([]);
	});

	it('tekKisiBul yakın yazımı da çözer', () => {
		expect(tekKisiBul('Zaid Waldhu', fz)?.id).toBe('waldu');
		expect(tekKisiBul('Paul Janes', fz)).toBeNull();
	});
});
