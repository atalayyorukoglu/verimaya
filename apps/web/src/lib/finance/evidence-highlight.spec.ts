/**
 * AI-09 — taslak kartındaki kaynak rozetinin UI tarafı.
 *
 * Kabul kriteri: evidence'sız taslak kartı BOZMAZ. Aşağıdaki her "yok" durumu
 * (eski kayıt, heuristic'in iz üretmediği alan, boş alıntı) sessizce boş sonuç
 * verir — hiçbiri istisna atmaz.
 */
import { describe, expect, it } from 'vitest';
import type { TransactionEvidence, TransactionEvidenceField } from '@verimaya/shared';
import { locateEvidenceQuote, visibleSourceQuotes } from './evidence-highlight';

const MESSAGE = 'Sandra Lab için 2900 GBP ödendi';

describe('locateEvidenceQuote', () => {
	it('sunucunun verdiği ofsetle alıntıyı konumlar', () => {
		const parts = locateEvidenceQuote(MESSAGE, {
			quote: '2900',
			start: MESSAGE.indexOf('2900'),
			confidence: 'high'
		});
		expect(parts).toEqual({
			before: 'Sandra Lab için ',
			match: '2900',
			after: ' GBP ödendi'
		});
	});

	it('ofset kaymışsa (kullanıcı metni düzenledi) alıntıyı yeniden arar', () => {
		const parts = locateEvidenceQuote(`Not: ${MESSAGE}`, {
			quote: '2900',
			start: MESSAGE.indexOf('2900'),
			confidence: 'high'
		});
		expect(parts?.match).toBe('2900');
		expect(parts?.before).toBe('Not: Sandra Lab için ');
	});

	it('ofset null olsa da alıntı bulunur (maskeleme ofseti düşürmüştü)', () => {
		const parts = locateEvidenceQuote(MESSAGE, {
			quote: 'GBP',
			start: null,
			confidence: 'high'
		});
		expect(parts?.match).toBe('GBP');
	});

	it('alıntı metinde geçmiyorsa null — vurgulanmaz, karta zarar vermez', () => {
		expect(
			locateEvidenceQuote(MESSAGE, { quote: 'tel [TELEFON]', start: 3, confidence: 'medium' })
		).toBeNull();
	});

	it('boş alıntı (çıkarım) ve iz yokluğu null döner', () => {
		expect(locateEvidenceQuote(MESSAGE, { quote: '', start: null, confidence: 'low' })).toBeNull();
		expect(locateEvidenceQuote(MESSAGE, null)).toBeNull();
		expect(locateEvidenceQuote(MESSAGE, undefined)).toBeNull();
	});
});

describe('visibleSourceQuotes', () => {
	const label = (f: TransactionEvidenceField) => `L:${f}`;

	it('izsiz ESKİ işlem satırı boş liste verir', () => {
		expect(visibleSourceQuotes(null, label)).toEqual([]);
		expect(visibleSourceQuotes(undefined, label)).toEqual([]);
	});

	it('yalnız gerçek alıntısı olan alanlar listelenir, çıkarımlar elenir', () => {
		const evidence: TransactionEvidence = {
			amount: { quote: '2900', start: 16, confidence: 'high' },
			currency: { quote: 'GBP', start: 21, confidence: 'high' },
			occurred_on: { quote: '', start: null, confidence: 'low' }
		};
		expect(visibleSourceQuotes(evidence, label)).toEqual([
			{ field: 'amount', label: 'L:amount', quote: '2900' },
			{ field: 'currency', label: 'L:currency', quote: 'GBP' }
		]);
	});

	it('yalnız çıkarım taşıyan iz hiç satır üretmez', () => {
		expect(
			visibleSourceQuotes({ category: { quote: '', start: null, confidence: 'low' } }, label)
		).toEqual([]);
	});
});
