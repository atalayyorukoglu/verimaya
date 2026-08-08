import { describe, expect, it } from 'vitest';
import { resolveCollectedAmount } from './transaction.js';

describe('resolveCollectedAmount', () => {
	it('paid + paidAmount null → full amount (Tracker model)', () => {
		expect(
			resolveCollectedAmount({ status: 'paid', amount: 18_062_100, paidAmount: null })
		).toBe(18_062_100);
	});

	it('paid + paidAmount set → paidAmount', () => {
		expect(resolveCollectedAmount({ status: 'paid', amount: 10_000, paidAmount: 10_000 })).toBe(
			10_000
		);
	});

	it('partial → paidAmount (0 when null)', () => {
		expect(resolveCollectedAmount({ status: 'partial', amount: 10_000, paidAmount: 4_000 })).toBe(
			4_000
		);
		expect(resolveCollectedAmount({ status: 'partial', amount: 10_000, paidAmount: null })).toBe(0);
	});

	it('unpaid → 0 even if paidAmount is set', () => {
		expect(resolveCollectedAmount({ status: 'unpaid', amount: 10_000, paidAmount: null })).toBe(0);
		expect(resolveCollectedAmount({ status: 'unpaid', amount: 10_000, paidAmount: 500 })).toBe(0);
	});
});
