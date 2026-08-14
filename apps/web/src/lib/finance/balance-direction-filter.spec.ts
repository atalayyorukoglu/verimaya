import { describe, expect, it } from 'vitest';
import { filterBalancesByDirection } from './balance-direction-filter';

const balances = [
	{ id: 'payable', open_amount: -100 },
	{ id: 'zero', open_amount: 0 },
	{ id: 'receivable', open_amount: 250 }
];

describe('filterBalancesByDirection', () => {
	it('returns everything for all', () => {
		expect(filterBalancesByDirection(balances, 'all')).toEqual(balances);
	});

	it('keeps only negative open amounts for payable', () => {
		expect(filterBalancesByDirection(balances, 'payable')).toEqual([
			{ id: 'payable', open_amount: -100 }
		]);
	});

	it('keeps only positive open amounts for receivable', () => {
		expect(filterBalancesByDirection(balances, 'receivable')).toEqual([
			{ id: 'receivable', open_amount: 250 }
		]);
	});

	it('excludes zero from payable and receivable while all includes it', () => {
		expect(filterBalancesByDirection(balances, 'payable')).not.toContainEqual({
			id: 'zero',
			open_amount: 0
		});
		expect(filterBalancesByDirection(balances, 'receivable')).not.toContainEqual({
			id: 'zero',
			open_amount: 0
		});
		expect(filterBalancesByDirection(balances, 'all')).toContainEqual({
			id: 'zero',
			open_amount: 0
		});
	});
});
