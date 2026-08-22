import { describe, expect, it } from 'vitest';
import {
	buildMayaMaskedQuestion,
	contactSearchTermsFromQuestion
} from './maya-contact-match';

const AYSE = { id: '11111111-1111-4111-8111-111111111111', displayName: 'Ayşe Yılmaz' };
const MEHMET = { id: '22222222-2222-4222-8222-222222222222', displayName: 'Mehmet Yılmaz' };
const ADA = { id: '33333333-3333-4333-8333-333333333333', displayName: 'Ada Klinik' };

/**
 * AI-11a — PII sınırı. Modele **isim gitmez**: soru maskelenir, kişi opak UUID +
 * `KISI_n` token'ıyla temsil edilir. Belirsiz isim token almaz.
 */
describe('buildMayaMaskedQuestion', () => {
	it('tek eşleşen kişiyi token\'a çevirir, isim maskelenir', () => {
		const res = buildMayaMaskedQuestion('Ayşe Yılmaz ne kadar borçlu?', [AYSE]);

		expect(res.question).toBe('KISI_1 ne kadar borçlu?');
		expect(res.question).not.toContain('Ayşe');
		expect(res.question).not.toContain('Yılmaz');
		expect(res.contacts).toEqual([{ token: 'KISI_1', contact_ref: AYSE.id }]);
		expect(res.ambiguous).toBe(false);
	});

	it('Türkçe ek almış isimleri de yakalar', () => {
		const res = buildMayaMaskedQuestion("Ayşe'nin randevusu ne zaman?", [AYSE]);
		expect(res.question).not.toContain('Ayşe');
		expect(res.contacts).toHaveLength(1);
	});

	it('aynı soyisimli iki kişi varsa token üretilmez — tahmin yok', () => {
		const res = buildMayaMaskedQuestion('Yılmaz bey ne kadar borçlu?', [AYSE, MEHMET]);

		expect(res.contacts).toEqual([]);
		expect(res.matches).toEqual([]);
		expect(res.ambiguous).toBe(true);
		expect(res.question).toContain('[HASTA]');
		expect(res.question).not.toContain('Yılmaz');
	});

	it('tam ad verilirse belirsizlik çözülür', () => {
		const res = buildMayaMaskedQuestion('Mehmet Yılmaz ne kadar borçlu?', [AYSE, MEHMET]);

		expect(res.contacts).toEqual([{ token: 'KISI_1', contact_ref: MEHMET.id }]);
		expect(res.ambiguous).toBe(false);
	});

	it('3 harfli isim parçası önek olarak eşleşmez (Ada ≠ adam)', () => {
		const res = buildMayaMaskedQuestion('Adamlar ne kadar borçlu?', [ADA]);
		expect(res.contacts).toEqual([]);
	});

	it('telefon/e-posta soru içinde geçse de modele gitmez', () => {
		const res = buildMayaMaskedQuestion(
			'Ayşe Yılmaz 0555 111 22 33 ne kadar borçlu? ayse@ornek.com',
			[AYSE]
		);
		expect(res.question).toContain('[TELEFON]');
		expect(res.question).toContain('[EPOSTA]');
		expect(res.question).not.toContain('0555');
	});

	it('eşleşme yoksa soru olduğu gibi kalır', () => {
		const res = buildMayaMaskedQuestion('Saç ekimi fiyatımız ne?', [AYSE]);
		expect(res.contacts).toEqual([]);
		expect(res.ambiguous).toBe(false);
		expect(res.question).toBe('Saç ekimi fiyatımız ne?');
	});
});

describe('contactSearchTermsFromQuestion', () => {
	it('soru kalıbı kelimelerini aday sorgusuna sokmaz', () => {
		const terms = contactSearchTermsFromQuestion('Ayşe Yılmaz ne kadar borçlu?');
		expect(terms).toContain('ayşe');
		expect(terms).toContain('yılmaz');
		expect(terms).not.toContain('kadar');
		expect(terms).not.toContain('borçlu');
	});

	it('en fazla 8 terim üretir', () => {
		const terms = contactSearchTermsFromQuestion(
			'alfa beta gama delta epsilon zeta eta teta iota kappa'
		);
		expect(terms).toHaveLength(8);
	});
});
