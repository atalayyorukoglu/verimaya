import { describe, expect, it } from 'vitest';
import type { Transaction } from '@verimaya/shared';
import { amountInBase, paidAmountInBase } from './money-base';

/** Minimal Transaction-shaped fixtures for amountInBase parity with API resolveBaseAmount. */
function tx(
	partial: Pick<Transaction, 'amount' | 'currency'> &
		Partial<Pick<Transaction, 'amount_base' | 'base_currency' | 'status' | 'paid_amount'>>
): Transaction {
	return {
		id: '00000000-0000-0000-0000-000000000001',
		tenant_id: '00000000-0000-0000-0000-000000000002',
		kind: 'income',
		title: 't',
		subtitle: null,
		category: null,
		occurred_on: '2026-01-01',
		status: 'paid',
		invoice_status: 'none',
		payment_method: null,
		paid_amount: null,
		amount_base: null,
		base_currency: null,
		fx_rate: null,
		fx_dated: null,
		contact_id: null,
		contact_display_name: null,
		contact_label: null,
		description: null,
		created_at: '2026-01-01T00:00:00.000Z',
		updated_at: '2026-01-01T00:00:00.000Z',
		...partial
	};
}

describe('amountInBase (parity with resolveBaseAmount)', () => {
	it('matches native / snapshot / wrong-base / null-base cases', () => {
		const cases: Array<{
			row: ReturnType<typeof tx>;
			tenantBase: 'GBP' | 'EUR' | 'TRY';
			expected: number | null;
		}> = [
			{ row: tx({ amount: 1000, currency: 'GBP' }), tenantBase: 'GBP', expected: 1000 },
			{
				row: tx({ amount: 1000, amount_base: 900, currency: 'GBP' }),
				tenantBase: 'GBP',
				expected: 900
			},
			{
				row: tx({
					amount: 10000,
					amount_base: 2500,
					currency: 'TRY',
					base_currency: 'GBP'
				}),
				tenantBase: 'GBP',
				expected: 2500
			},
			{
				row: tx({
					amount: 10000,
					amount_base: 2500,
					currency: 'TRY',
					base_currency: 'EUR'
				}),
				tenantBase: 'GBP',
				expected: null
			},
			{
				row: tx({
					amount: 10000,
					amount_base: 2500,
					currency: 'TRY',
					base_currency: null
				}),
				tenantBase: 'GBP',
				expected: null
			},
			{ row: tx({ amount: 10000, currency: 'TRY' }), tenantBase: 'GBP', expected: null }
		];

		for (const c of cases) {
			expect(amountInBase(c.row, c.tenantBase)).toBe(c.expected);
		}
	});
});

describe('paidAmountInBase (parity with resolvePaidBaseAmount)', () => {
	it('paid + paid_amount null contributes full amount', () => {
		expect(
			paidAmountInBase(tx({ amount: 18_062_100, currency: 'GBP', status: 'paid' }), 'GBP')
		).toBe(18_062_100);
	});

	it('partial uses paid_amount', () => {
		expect(
			paidAmountInBase(
				tx({ amount: 10_000, currency: 'GBP', status: 'partial', paid_amount: 4_000 }),
				'GBP'
			)
		).toBe(4_000);
	});

	it('unpaid contributes 0', () => {
		expect(paidAmountInBase(tx({ amount: 10_000, currency: 'GBP', status: 'unpaid' }), 'GBP')).toBe(
			0
		);
	});
});
