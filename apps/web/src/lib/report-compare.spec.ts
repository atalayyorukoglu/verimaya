import { describe, expect, it } from 'vitest';
import { computeReportDelta } from './report-compare';

describe('computeReportDelta', () => {
	it('önceki 0, mevcut 0 → none', () => {
		expect(computeReportDelta(0, 0, 10)).toEqual({ kind: 'none' });
	});

	it('önceki 0, mevcut > 0 → new (yüzde gösterilmez, sıfıra bölme yok)', () => {
		expect(computeReportDelta(500, 0, 10)).toEqual({ kind: 'new' });
	});

	it('referans kayıt sayısı 5’ten az → ham fark, yüzde yok', () => {
		expect(computeReportDelta(120, 100, 4)).toEqual({ kind: 'raw', diff: 20 });
	});

	it('referans kayıt sayısı 5’ten az → tam sınırda (4) hâlâ ham', () => {
		expect(computeReportDelta(80, 100, 4)).toEqual({ kind: 'raw', diff: -20 });
	});

	it('yeterli örneklem (>=5) → fark + yüzde', () => {
		expect(computeReportDelta(120, 100, 5)).toEqual({ kind: 'pct', diff: 20, pct: 0.2 });
	});

	it('negatif önceki değer için de |previous| ile bölünür', () => {
		expect(computeReportDelta(-50, -100, 10)).toEqual({ kind: 'pct', diff: 50, pct: 0.5 });
	});
});
