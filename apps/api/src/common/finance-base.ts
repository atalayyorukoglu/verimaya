import { resolveCollectedAmount } from '@verimaya/shared';

export type TxAmountRow = {
	kind: string;
	status: string;
	amount: number;
	amountBase: number | null;
	/** Currency the amount_base snapshot was stored in; must match tenant base to count. */
	baseCurrency: string | null;
	currency: string;
	paidAmount: number | null;
};

export function resolveBaseAmount(row: TxAmountRow, tenantBase: string): number | null {
	if (row.currency === tenantBase) {
		return row.amountBase ?? row.amount;
	}
	if (row.amountBase != null && row.baseCurrency === tenantBase) {
		return row.amountBase;
	}
	return null;
}

/**
 * Collected (tahsil) amount in tenant base currency (minor units).
 * Uses {@link resolveCollectedAmount} for status↔paid_amount, then FX snapshot.
 */
export function resolvePaidBaseAmount(row: TxAmountRow, tenantBase: string): number | null {
	const base = resolveBaseAmount(row, tenantBase);
	if (base == null) return null;
	const paid = resolveCollectedAmount({
		status: row.status,
		amount: row.amount,
		paidAmount: row.paidAmount
	});
	if (row.amount <= 0) return 0;
	if (row.currency === tenantBase) return paid;
	return Math.round((paid / row.amount) * base);
}
