import { describe, expect, it } from 'vitest';
import {
	REPORT_THRESHOLDS,
	evaluateFinding,
	sortFindingsBySeverity
} from './report-thresholds.js';

describe('AI-05 eşik tablosu', () => {
	it('az kayda dayanan oranı hiç yorumlamaz — 4 ameliyatın 1i RPT gürültüdür', () => {
		const f = evaluateFinding('rpt_rate', {
			current: 0.25,
			previous: 0.05,
			sampleSize: 4
		});
		expect(f.reportable).toBe(false);
		expect(f.skip_reason).toBe('insufficient_sample');
	});

	it('yeterli kayıtta belirgin RPT artışını bulgu sayar', () => {
		const f = evaluateFinding('rpt_rate', {
			current: 0.19,
			previous: 0.08,
			sampleSize: 42
		});
		expect(f.reportable).toBe(true);
		expect(f.skip_reason).toBeNull();
		expect(f.relative_change).toBeGreaterThan(1);
		expect(f.severity).toBeGreaterThan(0);
	});

	it('eşiğin altındaki dalgalanmayı bulgu saymaz', () => {
		// %20 → %23: göreli artış %15, rpt_rate eşiği %25.
		const f = evaluateFinding('rpt_rate', {
			current: 0.23,
			previous: 0.2,
			sampleSize: 60
		});
		expect(f.reportable).toBe(false);
		expect(f.skip_reason).toBe('change_too_small');
	});

	it('iyileşmeyi müdahale listesine sokmaz — iyi haber müdahale gerektirmez', () => {
		const f = evaluateFinding('rpt_rate', {
			current: 0.04,
			previous: 0.2,
			sampleSize: 50
		});
		expect(f.reportable).toBe(false);
		expect(f.skip_reason).toBe('improved');
		expect(f.relative_change).toBeLessThan(0);
	});

	it('yön metriğe göre değişir — gelir DÜŞÜNCE kötü haberdir', () => {
		const dusus = evaluateFinding('income', {
			current: 70_000_00,
			previous: 100_000_00,
			sampleSize: 40,
			periodTotal: 100_000_00
		});
		expect(dusus.reportable).toBe(true);

		const artis = evaluateFinding('income', {
			current: 130_000_00,
			previous: 100_000_00,
			sampleSize: 40,
			periodTotal: 130_000_00
		});
		expect(artis.reportable).toBe(false);
		expect(artis.skip_reason).toBe('improved');
	});

	it('önceki dönem 0 ise bulgu üretmez — "sonsuz artış" demez', () => {
		const f = evaluateFinding('outstanding', {
			current: 5_000_00,
			previous: 0,
			sampleSize: 20
		});
		expect(f.reportable).toBe(false);
		expect(f.skip_reason).toBe('no_previous');
	});

	it('göreli eşiği geçen ama toplamda önemsiz kalan para değişimini eler', () => {
		// 1.000 → 700 birim: göreli düşüş %30 (eşik %15 aşıldı) ama dönem toplamı
		// 500.000 birim; fark toplamın binde 6'sı, eşik %5. Haber değil.
		const f = evaluateFinding('income', {
			current: 700_00,
			previous: 1_000_00,
			sampleSize: 12,
			periodTotal: 500_000_00
		});
		expect(f.reportable).toBe(false);
		expect(f.skip_reason).toBe('share_too_small');
	});

	it('dönem toplamı bilinmiyorsa yalnız göreli eşik uygulanır', () => {
		const f = evaluateFinding('income', {
			current: 700_00,
			previous: 1_000_00,
			sampleSize: 12
		});
		expect(f.reportable).toBe(true);
	});

	it('ağırlık sıralamayı değiştirir — açık alacak, aynı büyüklükteki gelir düşüşünün üstünde', () => {
		const alacak = evaluateFinding('outstanding', {
			current: 130_000_00,
			previous: 100_000_00,
			sampleSize: 30,
			periodTotal: 200_000_00
		});
		const gelir = evaluateFinding('income', {
			current: 70_000_00,
			previous: 100_000_00,
			sampleSize: 30,
			periodTotal: 200_000_00
		});
		expect(alacak.reportable).toBe(true);
		expect(gelir.reportable).toBe(true);
		// Aynı %30 büyüklük, farklı ağırlık (outstanding 1.2 > income 0.9).
		expect(alacak.severity).toBeGreaterThan(gelir.severity);

		const sirali = sortFindingsBySeverity([gelir, alacak]);
		expect(sirali[0]).toBe(alacak);
	});

	it('sortFindingsBySeverity girdi dizisini değiştirmez', () => {
		const a = { severity: 1 };
		const b = { severity: 5 };
		const girdi = [a, b];
		const cikti = sortFindingsBySeverity(girdi);
		expect(girdi).toEqual([a, b]);
		expect(cikti).toEqual([b, a]);
	});

	it('RPT eşiği diğer oran metriklerinden yüksektir — yanlış alarmın bedeli en yüksek', () => {
		expect(REPORT_THRESHOLDS.rpt_rate.minRelative).toBeGreaterThan(
			REPORT_THRESHOLDS.no_show_rate.minRelative
		);
	});
});
