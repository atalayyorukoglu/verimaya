import { resolveCollectedAmount, type SupportedCurrency, type Transaction } from '@verimaya/shared';

/**
 * Amount in tenant reporting currency (minor units), or null if not convertible.
 * Uses immutable FX snapshot — never live rates.
 * Must stay in lockstep with apps/api/src/common/finance-base.ts resolveBaseAmount.
 */
export function amountInBase(tx: Transaction, tenantBase: SupportedCurrency): number | null {
	if (tx.currency === tenantBase) {
		return tx.amount_base ?? tx.amount;
	}
	if (tx.amount_base != null && tx.base_currency === tenantBase) {
		return tx.amount_base;
	}
	return null;
}

/**
 * Collected (tahsil) amount in tenant base — mirrors resolvePaidBaseAmount.
 * Status↔paid_amount via {@link resolveCollectedAmount}.
 */
export function paidAmountInBase(tx: Transaction, tenantBase: SupportedCurrency): number | null {
	const base = amountInBase(tx, tenantBase);
	if (base == null) return null;
	const paid = resolveCollectedAmount({
		status: tx.status,
		amount: tx.amount,
		paidAmount: tx.paid_amount
	});
	if (tx.amount <= 0) return 0;
	if (tx.currency === tenantBase) return paid;
	return Math.round((paid / tx.amount) * base);
}

export function isFxMissing(tx: Transaction, tenantBase: SupportedCurrency): boolean {
	return amountInBase(tx, tenantBase) == null;
}
