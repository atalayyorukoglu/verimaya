import { describe, expect, it } from 'vitest';
import { computeAssessmentStats, maturityFromPercentage } from './stats.js';

describe('computeAssessmentStats (Adım 36)', () => {
	it('counts zeros and percentage for applicable criteria only', () => {
		const stats = computeAssessmentStats(
			'16+',
			{ S1: true, S2: true, S3: true },
			[
				{ criterionId: '1.1', score: 0, naDeclared: false },
				{ criterionId: '1.2', score: 4, naDeclared: false },
				{ criterionId: '7.6', score: 0, naDeclared: false }
			]
		);
		expect(stats.denominator).toBe(43);
		expect(stats.zeroCount).toBe(2);
		expect(stats.scoredCount).toBe(3);
		expect(stats.percentage).toBe(Math.round(((0 + 4 + 0) / (43 * 4)) * 1000) / 10);
		expect(maturityFromPercentage(stats.percentage!)).toBe('baslangic');
	});

	it('maps maturity thresholds', () => {
		expect(maturityFromPercentage(0)).toBe('baslangic');
		expect(maturityFromPercentage(32)).toBe('parcali');
		expect(maturityFromPercentage(56)).toBe('tutarli');
		expect(maturityFromPercentage(80)).toBe('olgun');
	});
});
