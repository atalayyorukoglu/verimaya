import { describe, expect, it } from 'vitest';
import { heuristicParseWhatsappMessage } from './heuristic-parse';
import type { TenantKategori } from './kategori';

const KATEGORILER: TenantKategori[] = [
	{ kind: 'expense', name: 'Konaklama', subcategories: ['Otel'] },
	{ kind: 'expense', name: 'Operasyon', subcategories: ['Saç ekimi'] }
];

/** Örnekler 2026-09-15 kuyruğundan; hepsi gerçek yanlış çıktıların tekrarı. */
describe('heuristicParseWhatsappMessage — tutar bekçisi', () => {
	it('Türkçe para birimi kelimeleri tanınır, binlik nokta doğru okunur', () => {
		const [r] = heuristicParseWhatsappMessage('18.200 tl personel yemekleri odendi.');
		expect(r).toMatchObject({ amount: 1_820_000, currency: 'TRY', kind: 'expense' });
		const [g] = heuristicParseWhatsappMessage('1400 Gbp Mujdat bey sirkete para koymustur.');
		expect(g).toMatchObject({ amount: 140_000, currency: 'GBP' });
		const [e] = heuristicParseWhatsappMessage('Hesaba 2.900 euro yatirildi.');
		expect(e).toMatchObject({ amount: 290_000, currency: 'EUR' });
		const [k] = heuristicParseWhatsappMessage(
			'Karen O Donnell Dumos Hotel konaklama faturasi 25.217,25 tl.'
		);
		expect(k).toMatchObject({ amount: 2_521_725, currency: 'TRY' });
	});

	it('TNC saat listesi tutar değildir', () => {
		expect(heuristicParseWhatsappMessage('15.09.26\n12:00 zaid waldu')).toEqual([]);
	});

	it('tarih ve saat içeren mesai mesajı tutar değildir', () => {
		expect(
			heuristicParseWhatsappMessage(
				'Sudenaz Karatas 09.09.2026 saat 21:40 a kadar extra mesaiye kalmistir.'
			)
		).toEqual([]);
	});

	it('bahsetme kimliği tutar değildir; para kelimesi olsa da başka sayı yoksa taslak yok', () => {
		expect(
			heuristicParseWhatsappMessage(
				'@185465378484230 pazartesi gunu kredi odemesi var. Fakat butce yok.'
			)
		).toEqual([]);
	});

	it('para birimi yok ama para kelimesi ve düz sayı var: TRY varsayılır', () => {
		const [r] = heuristicParseWhatsappMessage("Sudenaz Karatas'a 2600 prim verildi.");
		expect(r).toMatchObject({ amount: 260_000, currency: 'TRY' });
	});

	it('para kelimesi yoksa çıplak sayı taslak üretmez', () => {
		expect(heuristicParseWhatsappMessage('grand park lara resort 2 kisi 1 oda')).toEqual([]);
	});
});

describe('heuristicParseWhatsappMessage — tarih ve açıklama', () => {
	it('işlem tarihi mesajın günüdür, analiz günü değil', () => {
		const [r] = heuristicParseWhatsappMessage(
			'18.200 tl personel yemekleri odendi.',
			[],
			'2026-09-12'
		);
		expect(r.occurred_on).toBe('2026-09-12');
		const [p] = heuristicParseWhatsappMessage(
			"Sudenaz Karatas'a 2600 prim verildi.",
			[],
			'2026-09-12'
		);
		expect(p.occurred_on).toBe('2026-09-12');
	});

	it('mesaj günü verilmezse bugüne düşülür', () => {
		const [r] = heuristicParseWhatsappMessage('18.200 tl personel yemekleri odendi.');
		expect(r.occurred_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it('not alanı mesaj metnidir ve 8000 karakterle sınırlıdır', () => {
		const [r] = heuristicParseWhatsappMessage('18.200 tl personel yemekleri odendi.');
		expect(r.description).toBe('18.200 tl personel yemekleri odendi.');
		const uzun = `1400 Gbp odendi. ${'a'.repeat(9000)}`;
		const [u] = heuristicParseWhatsappMessage(uzun);
		expect(u.description?.length).toBe(8000);
	});
});

describe('heuristicParseWhatsappMessage — kategori ve ödeme yöntemi', () => {
	it('kategori kiracı listesinden gelir; liste yoksa null (eski sabit ad yok)', () => {
		const [r] = heuristicParseWhatsappMessage(
			'Karen O Donnell Dumos Hotel konaklama faturasi 25.217,25 tl.',
			[],
			null,
			KATEGORILER
		);
		expect(r.category).toBe('Konaklama');
		const [bos] = heuristicParseWhatsappMessage(
			'Karen O Donnell Dumos Hotel konaklama faturasi 25.217,25 tl.'
		);
		expect(bos.category).toBeNull();
	});

	it('ödeme yöntemi Finans listesindeki değerdir ("Kart" değil "Kredi Kartı")', () => {
		const [k] = heuristicParseWhatsappMessage('1400 Gbp kart ile odendi.');
		expect(k.payment_method).toBe('Kredi Kartı');
		const [h] = heuristicParseWhatsappMessage('18.200 tl havale ile odendi.');
		expect(h.payment_method).toBe('Banka Havalesi/EFT');
	});
});
