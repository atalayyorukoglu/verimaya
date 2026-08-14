import { describe, expect, it } from 'vitest';
import type { FinanceCategory } from '@verimaya/shared';
import { moveCategoryWithinKind, toCategoryReorderItems } from './category-order';

const now = '2026-08-14T10:00:00.000Z';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function category(
	id: string,
	kind: FinanceCategory['kind'],
	name: string,
	sortOrder: number
): FinanceCategory {
	return {
		id,
		tenant_id: tenantId,
		kind,
		name,
		sort_order: sortOrder,
		subcategories: [],
		created_at: now,
		updated_at: now
	};
}

describe('finance category ordering', () => {
	const incomeOne = category('11111111-1111-4111-8111-111111111111', 'income', 'Gelir 1', 0);
	const expenseOne = category('22222222-2222-4222-8222-222222222222', 'expense', 'Gider 1', 0);
	const incomeTwo = category('33333333-3333-4333-8333-333333333333', 'income', 'Gelir 2', 1);
	const expenseTwo = category('44444444-4444-4444-8444-444444444444', 'expense', 'Gider 2', 1);
	const items = [incomeOne, expenseOne, incomeTwo, expenseTwo];

	it('moves a category only inside its income/expense list', () => {
		const moved = moveCategoryWithinKind(items, incomeTwo.id, -1);

		expect(moved).not.toBeNull();
		expect(moved!.find((item) => item.id === incomeTwo.id)?.sort_order).toBe(0);
		expect(moved!.find((item) => item.id === incomeOne.id)?.sort_order).toBe(1);
		expect(moved!.find((item) => item.id === expenseOne.id)?.sort_order).toBe(0);
		expect(moved!.find((item) => item.id === expenseTwo.id)?.sort_order).toBe(1);
	});

	it('rejects moves past a kind boundary and serializes the resulting absolute order', () => {
		expect(moveCategoryWithinKind(items, incomeOne.id, -1)).toBeNull();
		expect(toCategoryReorderItems(items)).toEqual(
			items.map(({ id, sort_order }) => ({ id, sort_order }))
		);
	});
});
