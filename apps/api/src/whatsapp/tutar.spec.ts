import { describe, expect, it } from 'vitest';
import type { TransactionDraft } from '@verimaya/shared';
import { paraBaglamiVar, parseTutar, tutarDegil, tutarlariDuzelt } from './tutar';

describe('parseTutar — Türkçe yazım', () => {
	it('nokta binlik, virgül ondalık', () => {
		expect(parseTutar('18.200')).toBe(18200);
		expect(parseTutar('59.974')).toBe(59974);
		expect(parseTutar('1.979,56')).toBe(1979.56);
		expect(parseTutar('24.534,96')).toBe(24534.96);
		expect(parseTutar('16,76')).toBe(16.76);
		expect(parseTutar('444.741')).toBe(444741);
		expect(parseTutar('1400')).toBe(1400);
	});

	it('tek nokta + 1–2 basamak ondalıktır ("2.5")', () => {
		expect(parseTutar('2.5')).toBe(2.5);
		expect(parseTutar('16.76')).toBe(16.76);
	});

	it('sayı olmayanı reddeder', () => {
		expect(parseTutar('abc')).toBeNull();
		expect(parseTutar('12.3.4')).toBe(1234);
	});
});

describe('tutarDegil', () => {
	it('tarih, saat, bahsetme kimliği, çıplak yıl tutar değildir', () => {
		expect(tutarDegil('15.09.26', '15.09.26\n12:00 zaid waldu')).toBe(true);
		expect(tutarDegil('09.09.2026', 'Sudenaz Karatas 09.09.2026 saat 21:40')).toBe(true);
		expect(tutarDegil('21', 'saat 21:40 a kadar')).toBe(true);
		expect(tutarDegil('185465378484230', '@185465378484230 pazartesi')).toBe(true);
		expect(tutarDegil('2026', 'Agustos 2026 Maas hakedisi')).toBe(true);
	});

	it('gerçek tutar tutar sayılır', () => {
		expect(tutarDegil('18.200', '18.200 tl personel yemekleri')).toBe(false);
		expect(tutarDegil('1400', '1400 Gbp Mujdat bey')).toBe(false);
	});
});

describe('paraBaglamiVar', () => {
	it('para kelimesi olan mesaj', () => {
		expect(paraBaglamiVar('Sudenaz Karatas a 2600 prim verildi')).toBe(true);
		expect(paraBaglamiVar('15.09.26 12:00 zaid waldu')).toBe(false);
	});
});

describe('tutarlariDuzelt — LLM çıktısının bekçisi', () => {
	const taslak = (
		amount: number,
		quote: string,
		start: number | null = null
	): TransactionDraft => ({
		kind: 'expense',
		amount,
		currency: 'TRY',
		title: 't',
		occurred_on: '2026-09-15',
		evidence: { amount: { quote, start, confidence: 'high' } }
	});

	it('alıntı 18.200 iken 182 gelen tutarı 18.200 yapar', () => {
		const [r] = tutarlariDuzelt([taslak(18200, '18.200')], '18.200 tl personel yemekleri odendi.');
		expect(r.amount).toBe(1_820_000);
	});

	it('doğru tutarı değiştirmez', () => {
		const r = taslak(2_521_725, '25.217,25');
		expect(tutarlariDuzelt([r], 'konaklama faturasi 25.217,25 tl.')[0]).toBe(r);
	});

	it('alıntı tarih ya da bahsetme kimliğiyse taslak düşer', () => {
		expect(
			tutarlariDuzelt([taslak(15_092_600, '15.09.26', 0)], '15.09.26\n12:00 zaid waldu')
		).toEqual([]);
		expect(
			tutarlariDuzelt(
				[taslak(1, '185465378484230')],
				'@185465378484230 pazartesi gunu kredi odemesi var.'
			)
		).toEqual([]);
	});

	it('alıntısız taslağa dokunmaz', () => {
		const r: TransactionDraft = { ...taslak(500, ''), evidence: undefined };
		expect(tutarlariDuzelt([r], 'x')).toEqual([r]);
	});
});

/**
 * 2026-09-16 canlı bulgusu: analizlerin ~%70'i modele ulaşıp boş sonuçla kural
 * tabanlı yola düşüyordu. Nedeni modelin susması değil, bekçinin kayıtları
 * düşürmesiydi: `evidence.amount.start` MASKELİ metne göre gelir (KISI_1 adın
 * yerini alır, metin kısalır), ham metne uygulanınca ofset kayar ve alıntı
 * başka bir sayının — çoğu kez bir saatin — ortasını gösterir.
 */
describe('tutarlariDuzelt — maskeleme ofseti kayması (canlı hata)', () => {
	const taslak = (amount: number, quote: string, start: number | null): TransactionDraft => ({
		kind: 'income',
		amount,
		currency: 'GBP',
		title: 't',
		occurred_on: '2026-09-15',
		evidence: { amount: { quote, start, confidence: 'high' } }
	});

	it('maskeli ofset saatin içine düşse bile kayıt düşmez', () => {
		const ham = 'Jennifer Severino 12:00 de 2520 gbp nakit alindi.';
		// "Jennifer Severino" (17) → "KISI_1" (6): model 11 karakter geride bir ofset yazar.
		const maskeliOfset = ham.indexOf('2520') - 11;
		expect(ham[maskeliOfset + '2520'.length]).toBe(':');

		const [r] = tutarlariDuzelt([taslak(252_000, '2520', maskeliOfset)], ham);
		expect(r).toBeDefined();
		expect(r.amount).toBe(252_000);
	});

	it('alıntı ham metinde hiç geçmiyorsa ofsetsiz karar verilir — kayıt düşmez', () => {
		const ham = 'KISI_1 olmayan bir metin, 1400 gbp odendi.';
		const [r] = tutarlariDuzelt([taslak(140_000, '1.400 gbp', 999)], ham);
		expect(r).toBeDefined();
	});
});

/** Kullanıcının şikâyet ettiği üç gerçek mesaj — hiçbirinin kaydı düşmemeli. */
describe('tutarlariDuzelt — canlı mesajlarda kayıt düşmüyor', () => {
	const iz = (quote: string, start: number | null) => ({
		amount: { quote, start, confidence: 'high' as const }
	});
	const taslak = (
		amount: number,
		currency: TransactionDraft['currency'],
		quote: string,
		start: number | null
	): TransactionDraft => ({
		kind: 'expense',
		amount,
		currency,
		title: 't',
		occurred_on: '2026-09-15',
		evidence: iz(quote, start)
	});

	it('"110 euro karsiligi 50 Gbp + 50 euro"', () => {
		const ham =
			'Jennifer Severino \n3 vida \n1 multi abutment toplamda 110 euro karsiligi 50 Gbp + 50 euro odendi.';
		const records = [taslak(5000, 'GBP', '50 Gbp', 60), taslak(5000, 'EUR', '50 euro', 69)];
		expect(tutarlariDuzelt(records, ham)).toHaveLength(2);
	});

	it('"Sonu 3721 ile biten … 21.400 tl odendi"', () => {
		const ham = 'Sonu 3721 ile biten Is Bankasi kredi kartina 21.400 tl odendi.';
		const records = [taslak(2_140_000, 'TRY', '21.400', 33)];
		const [r] = tutarlariDuzelt(records, ham);
		expect(r).toBeDefined();
		expect(r.amount).toBe(2_140_000);
	});

	it('"Toplamda 8260 Gbp … 2520 nakit 1510 kart … toplamda 4030 gbp"', () => {
		const ham =
			'Zaid Waldu 15.09.26 12:00\nToplamda 8260 Gbp tedavi bedeli. 2520 gbpsi nakit 1510 gbpsi kart olmak üzere toplamda 4030 gbp ödeme alindi.';
		const records = [
			taslak(252_000, 'GBP', '2520', 40),
			taslak(151_000, 'GBP', '1510', 58),
			taslak(826_000, 'GBP', '8260 Gbp', 20)
		];
		expect(tutarlariDuzelt(records, ham)).toHaveLength(3);
	});
});
