import { describe, expect, it } from 'vitest';
import { resolveBaseAmount, resolvePaidBaseAmount, type TxAmountRow } from './finance-base';

function row(
	partial: Partial<TxAmountRow> & Pick<TxAmountRow, 'amount'> & { currency: string | null }
): TxAmountRow {
	return {
		kind: 'income',
		status: 'paid',
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

	it('excludes rows with null currency', () => {
		expect(resolveBaseAmount(row({ amount: 10000, currency: null }), 'GBP')).toBeNull();
	});
});

describe('resolvePaidBaseAmount', () => {
	it('paid + paidAmount null contributes full amount in tenant base', () => {
		expect(
			resolvePaidBaseAmount(
				row({ status: 'paid', amount: 18_062_100, paidAmount: null, currency: 'GBP' }),
				'GBP'
			)
		).toBe(18_062_100);
	});

	it('partial uses paidAmount in tenant base', () => {
		expect(
			resolvePaidBaseAmount(
				row({ status: 'partial', amount: 10_000, paidAmount: 4_000, currency: 'GBP' }),
				'GBP'
			)
		).toBe(4_000);
	});

	it('unpaid contributes 0', () => {
		expect(
			resolvePaidBaseAmount(
				row({ status: 'unpaid', amount: 10_000, paidAmount: null, currency: 'GBP' }),
				'GBP'
			)
		).toBe(0);
	});

	it('scales paid null (= full) through FX snapshot', () => {
		expect(
			resolvePaidBaseAmount(
				row({
					status: 'paid',
					amount: 10_000,
					paidAmount: null,
					currency: 'TRY',
					amountBase: 2_500,
					baseCurrency: 'GBP'
				}),
				'GBP'
			)
		).toBe(2_500);
	});

	it('scales partial paidAmount through FX snapshot', () => {
		expect(
			resolvePaidBaseAmount(
				row({
					status: 'partial',
					amount: 10_000,
					paidAmount: 4_000,
					currency: 'TRY',
					amountBase: 2_500,
					baseCurrency: 'GBP'
				}),
				'GBP'
			)
		).toBe(1_000);
	});
});
