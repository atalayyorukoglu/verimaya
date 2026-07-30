import { describe, expect, it } from 'vitest';
import { buildAssessmentComparison } from './compare.js';

describe('buildAssessmentComparison (Adım 37)', () => {
	it('counts closed zeros 0→n', () => {
		const result = buildAssessmentComparison(
			[
				{ criterionId: '1.1', score: 0, naDeclared: false },
				{ criterionId: '2.4', score: 0, naDeclared: false },
				{ criterionId: '7.6', score: 2, naDeclared: false }
			],
			[
				{ criterionId: '1.1', score: 4, naDeclared: false },
				{ criterionId: '2.4', score: 0, naDeclared: false },
				{ criterionId: '7.6', score: 4, naDeclared: false }
			]
		);
		expect(result.previousZeroCount).toBe(2);
		expect(result.currentZeroCount).toBe(1);
		expect(result.closedZeros).toBe(1);
		expect(result.transitions.find((t) => t.criterionId === '1.1')?.closedZero).toBe(true);
		expect(result.transitions.find((t) => t.criterionId === '2.4')?.closedZero).toBe(false);
	});
});
