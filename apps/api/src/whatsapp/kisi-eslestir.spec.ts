import { describe, expect, it } from 'vitest';
import { kelimeler, kisiBul, type KisiAdayi } from './kisi-eslestir';

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
	hasta('tracey', 'Tracey Jane', 'Carter'),
	hasta('ali', 'Ali', 'Can'),
	kurum('tnc', 'TNC', 'Klinik'),
	kurum('dumos', 'Dumos', 'Otel'),
	kurum('self', 'Self', 'Otel'),
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

	it('çok kelimeli adın ilk kelimesi yeter', () => {
		expect(idler('Tracey icin Carter ailesi Aska Lara.')).toEqual(['tracey']);
	});
});

describe('kisiBul — yalnız soyad', () => {
	it('kiracıda tek olan soyad bağlar', () => {
		const [e] = kisiBul('Tasman klinik costu 2.261,42 Gbp kadar edecek.', adaylar);
		expect(e).toMatchObject({ contactId: 'aynur', method: 'surname' });
	});

	it('iki kişide olan soyad tek başına bağlamaz (McLeod)', () => {
		expect(idler('McLeod borcumuzdan dusulecektir.')).toEqual([]);
	});

	it('kısa soyad tek başına bağlamaz', () => {
		expect(idler('Can gelmedi.')).toEqual([]);
	});
});

describe('kisiBul — yanlış pozitif kapıları', () => {
	it('kısa ad başka kelimenin içinde sayılmaz ("ali" ≠ "alindi")', () => {
		expect(idler('4100 gbp nakit alindi. Yanlis yazildi.')).toEqual([]);
	});

	it('hasta olmayan tek kelimelik ad İngilizce cümlede yakalanmaz ("Self")', () => {
		expect(idler('I did it by myself, no hotel needed.')).toEqual([]);
	});

	it('boş ve medya-only mesajda boş döner', () => {
		expect(kisiBul('', adaylar)).toEqual([]);
		expect(kisiBul(null, adaylar)).toEqual([]);
	});

	it('personel de bağlanır — maaş mesajı kişinin akışına düşmeli', () => {
		expect(idler('Gulcin Ozer Agustos 2026 Maas hakedisi odendi. 90.000 tl')).toEqual(['gulcin']);
	});
});
