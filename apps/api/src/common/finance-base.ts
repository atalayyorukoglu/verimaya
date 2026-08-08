import { resolveCollectedAmount } from '@verimaya/shared';

/** Shared FX snapshot input — transactions and ad spend both use this. */
export type BaseAmountRow = {
	amount: number;
	amountBase: number | null;
	/** Currency the amount_base / spend_base snapshot was stored in; must match tenant base. */
	baseCurrency: string | null;
	/** Native currency; null = incomplete (cannot include in base totals). */
	currency: string | null;
};

export type TxAmountRow = BaseAmountRow & {
	kind: string;
	status: string;
	paidAmount: number | null;
};

/**
 * Amount in tenant reporting currency (minor units), or null if not convertible.
 * Immutable FX snapshot only — never live rates.
 */
export function resolveBaseAmount(row: BaseAmountRow, tenantBase: string): number | null {
	if (row.currency == null || row.currency === '') return null;
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
