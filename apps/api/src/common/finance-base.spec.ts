import { describe, expect, it } from 'vitest';
import { resolveBaseAmount, type TxAmountRow } from './finance-base';

function row(partial: Partial<TxAmountRow> & Pick<TxAmountRow, 'amount' | 'currency'>): TxAmountRow {
	return {
		kind: 'income',
		amountBase: null,
		baseCurrency: null,
		paidAmount: null,
		...partial
	};
}

describe('resolveBaseAmount', () => {
	it('uses native amount when currency matches tenant base', () => {
		expect(resolveBaseAmount(row({ amount: 1000, currency: 'GBP' }), 'GBP')).toBe(1000);
	});

	it('prefers amountBase when currency matches tenant base', () => {
		expect(
			resolveBaseAmount(row({ amount: 1000, amountBase: 900, currency: 'GBP' }), 'GBP')
		).toBe(900);
	});

	it('uses amountBase only when row.baseCurrency matches tenant base', () => {
		expect(
			resolveBaseAmount(
				row({ amount: 10000, amountBase: 2500, currency: 'TRY', baseCurrency: 'GBP' }),
				'GBP'
			)
		).toBe(2500);
	});

	it('excludes foreign rows whose amount_base was snapped for a different base', () => {
		expect(
			resolveBaseAmount(
				row({ amount: 10000, amountBase: 2500, currency: 'TRY', baseCurrency: 'EUR' }),
				'GBP'
			)
		).toBeNull();
	});

	it('excludes foreign rows with amountBase but null baseCurrency', () => {
		expect(
			resolveBaseAmount(
				row({ amount: 10000, amountBase: 2500, currency: 'TRY', baseCurrency: null }),
				'GBP'
			)
		).toBeNull();
	});

	it('excludes foreign rows without amountBase', () => {
		expect(resolveBaseAmount(row({ amount: 10000, currency: 'TRY' }), 'GBP')).toBeNull();
	});
});
