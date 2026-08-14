export type BalanceDirectionFilter = 'all' | 'payable' | 'receivable';

export type BalanceDirectionRow = {
	open_amount: number;
};

/**
 * Filter balance rows by open amount direction.
 * - all: no filter
 * - payable: open_amount < 0 (we owe them)
 * - receivable: open_amount > 0 (they owe us)
 */
export function filterBalancesByDirection<T extends BalanceDirectionRow>(
	items: T[],
	direction: BalanceDirectionFilter
): T[] {
	if (direction === 'payable') return items.filter((row) => row.open_amount < 0);
	if (direction === 'receivable') return items.filter((row) => row.open_amount > 0);
	return items;
}
