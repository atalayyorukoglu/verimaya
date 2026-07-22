import { describe, expect, it } from 'vitest';
import { calculateTruthMetrics } from './calculate.js';

describe('calculateTruthMetrics golden scenarios', () => {
	it('profitable: high margin with decent platform ROAS', () => {
		const result = calculateTruthMetrics({
			platformRoas: 3.3,
			salePrice: 100_000,
			operationCost: 40_000,
			commission: 5_000,
			platformExtraFeePercent: 2
		});

		expect(result.contributionMargin).toBe(53_000);
		expect(result.contributionRate).toBeCloseTo(0.53, 5);
		expect(result.realRoas).toBeCloseTo(1.749, 2);
		expect(result.breakEvenRoas).toBeCloseTo(1.887, 2);
		expect(result.profitStatus).toBe('profitable');
		expect(result.impliedAdCost).toBe(30_303);
		expect(result.netProfitPerCustomer).toBe(22_697);
	});

	it('losing despite high platform ROAS — thin contribution margin', () => {
		const result = calculateTruthMetrics({
			platformRoas: 4.0,
			salePrice: 50_000,
			operationCost: 40_000,
			commission: 5_000,
			platformExtraFeePercent: 2
		});

		expect(result.contributionMargin).toBe(4_000);
		expect(result.contributionRate).toBeCloseTo(0.08, 5);
		expect(result.realRoas).toBeCloseTo(0.32, 2);
		expect(result.profitStatus).toBe('losing');
		expect(result.netProfitPerCustomer).toBe(-8_500);
	});

	it('break-even: real ROAS equals 1', () => {
		const result = calculateTruthMetrics({
			platformRoas: 2.0,
			salePrice: 20_000,
			operationCost: 9_000,
			commission: 1_000,
			platformExtraFeePercent: 0
		});

		expect(result.contributionMargin).toBe(10_000);
		expect(result.contributionRate).toBe(0.5);
		expect(result.realRoas).toBeCloseTo(1.0, 5);
		expect(result.breakEvenRoas).toBe(2);
		expect(result.profitStatus).toBe('break_even');
	});

	it('computes max ad cost with target margin', () => {
		const result = calculateTruthMetrics({
			platformRoas: 3.3,
			salePrice: 100_000,
			operationCost: 40_000,
			commission: 5_000,
			platformExtraFeePercent: 2,
			targetMarginPercent: 15
		});

		expect(result.maxAdCostPerCustomer).toBe(38_000);
	});
});
