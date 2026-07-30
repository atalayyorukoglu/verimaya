import { describe, expect, it } from 'vitest';
import {
	SCORECARD_APPROX_VALID_RANGE,
	SCORECARD_BAND_IDS,
	SCORECARD_CRITERIA,
	SCORECARD_CRITERION_COUNT,
	SCORECARD_DIMENSIONS,
	SCORECARD_SETUP_QUESTIONS,
	countApplicableCriteria,
	criterionDisplayText,
	getCriterionById,
	isCriterionInDenominator
} from './index.js';
import type { SetupAnswers } from './types.js';

const allSetupNo: SetupAnswers = { S1: false, S2: false, S3: false };
const allSetupYes: SetupAnswers = { S1: true, S2: true, S3: true };

describe('scorecard criteria catalog (Adım 33)', () => {
	it('has exactly 43 criteria', () => {
		expect(SCORECARD_CRITERIA).toHaveLength(SCORECARD_CRITERION_COUNT);
		expect(SCORECARD_CRITERIA).toHaveLength(43);
	});

	it('has unique ids covering 3.6, 4.6, 7.6 (v3)', () => {
		const ids = SCORECARD_CRITERIA.map((c) => c.id);
		expect(new Set(ids).size).toBe(43);
		expect(ids).toContain('3.6');
		expect(ids).toContain('4.6');
		expect(ids).toContain('7.6');
	});

	it('has eight dimensions with fixed weights', () => {
		expect(SCORECARD_DIMENSIONS).toHaveLength(8);
		expect(SCORECARD_DIMENSIONS.find((d) => d.id === 'strategy')?.weight).toBe(1.5);
		expect(SCORECARD_DIMENSIONS.find((d) => d.id === 'technology')?.weight).toBe(1);
		expect(SCORECARD_DIMENSIONS.find((d) => d.id === 'risk')?.weight).toBe(1.5);
	});

	it('wires setup questions to 4.4 / 4.1+4.2 / 5.5', () => {
		expect(SCORECARD_SETUP_QUESTIONS.map((q) => q.id)).toEqual(['S1', 'S2', 'S3']);
		expect(getCriterionById('4.4')?.setupQuestion).toBe('S1');
		expect(getCriterionById('4.1')?.setupQuestion).toBe('S2');
		expect(getCriterionById('4.2')?.setupQuestion).toBe('S2');
		expect(getCriterionById('5.5')?.setupQuestion).toBe('S3');
	});

	it('never marks 7.6 as N/A in any band', () => {
		const c = getCriterionById('7.6')!;
		for (const band of SCORECARD_BAND_IDS) {
			expect(c.bandApplicability[band]).toBe('valid');
			expect(isCriterionInDenominator(c, band, allSetupNo)).toBe(true);
		}
	});

	it('matches §6 approx denominators for typical setup profiles', () => {
		// 1–4 tipik: setup hayır → ~32 (43 − 7 band-NA − 4 setup)
		const small = countApplicableCriteria('1-4', allSetupNo);
		expect(small).toBe(32);
		expect(small).toBeGreaterThanOrEqual(SCORECARD_APPROX_VALID_RANGE['1-4'].min);
		expect(small).toBeLessThanOrEqual(SCORECARD_APPROX_VALID_RANGE['1-4'].max);

		// 5–15 tipik ~39: band NA 1.5+2.5 + S2 hayır (4.1, 4.2); S1+S3 evet
		const mid = countApplicableCriteria('5-15', { S1: true, S2: false, S3: true });
		expect(mid).toBe(39);
		expect(mid).toBeGreaterThanOrEqual(SCORECARD_APPROX_VALID_RANGE['5-15'].min);
		expect(mid).toBeLessThanOrEqual(SCORECARD_APPROX_VALID_RANGE['5-15'].max);

		// 16+ full setup → 43; all setup no → 39 (yalnız 4 gated)
		expect(countApplicableCriteria('16+', allSetupYes)).toBe(43);
		expect(countApplicableCriteria('16+', allSetupNo)).toBe(39);
		expect(countApplicableCriteria('16+', allSetupYes)).toBeGreaterThanOrEqual(
			SCORECARD_APPROX_VALID_RANGE['16+'].min
		);
	});

	it('exposes restated text for 1.2 / 4.3 / 8.2', () => {
		expect(criterionDisplayText(getCriterionById('1.2')!, '1-4')).toMatch(/Sayı ve tarih/);
		expect(criterionDisplayText(getCriterionById('4.3')!, '1-4')).toMatch(/kişisel hesabını/);
		expect(criterionDisplayText(getCriterionById('8.2')!, '5-15')).toMatch(/iş sonucu/);
		expect(criterionDisplayText(getCriterionById('8.2')!, '1-4')).toBe(
			getCriterionById('8.2')!.text
		);
	});

	it('keeps setup-gated criteria out of denominator when answer is no', () => {
		const c44 = getCriterionById('4.4')!;
		expect(isCriterionInDenominator(c44, '16+', { ...allSetupYes, S1: false })).toBe(false);
		expect(isCriterionInDenominator(c44, '16+', allSetupYes)).toBe(true);
	});
});
