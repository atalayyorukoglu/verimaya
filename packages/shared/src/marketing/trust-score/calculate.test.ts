import { describe, expect, it } from 'vitest';
import { calculateTrustScore } from './calculate.js';

describe('calculateTrustScore', () => {
	it('returns 0 for empty checks', () => {
		expect(calculateTrustScore([])).toEqual({ score: 0, grade: 'F', checks: [] });
	});

	it('averages equal weights', () => {
		const result = calculateTrustScore([
			{ id: 'consent_mode', score: 100 },
			{ id: 'emq_score', score: 60 }
		]);
		expect(result.score).toBe(80);
		expect(result.grade).toBe('B');
	});
});
