import { describe, expect, it } from 'vitest';
import { calculateRealRoas } from './calculate.js';

describe('calculateRealRoas golden scenarios', () => {
	it('profitable: revenue 3x spend with CPL and CPC', () => {
		const result = calculateRealRoas({
			spendMinor: 100_000,
			revenueMinor: 300_000,
			leads: 20,
			closed: 5
		});

		expect(result.realRoas).toBeCloseTo(3);
		expect(result.costPerLead).toBe(5_000);
		expect(result.costPerClosed).toBe(20_000);
	});

	it('zero spend: real ROAS null, unit costs are 0 when denominators exist', () => {
		const result = calculateRealRoas({
			spendMinor: 0,
			revenueMinor: 50_000,
			leads: 10,
			closed: 2
		});

		expect(result.realRoas).toBeNull();
		expect(result.costPerLead).toBe(0);
		expect(result.costPerClosed).toBe(0);
	});

	it('spend with no conversions: ROAS 0, unit costs null', () => {
		const result = calculateRealRoas({
			spendMinor: 100_000,
			revenueMinor: 0,
			leads: 0,
			closed: 0
		});

		expect(result.realRoas).toBe(0);
		expect(result.costPerLead).toBeNull();
		expect(result.costPerClosed).toBeNull();
	});
});
