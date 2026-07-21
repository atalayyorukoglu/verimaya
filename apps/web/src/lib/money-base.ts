import type { SupportedCurrency, Transaction } from '@verimaya/shared';

/**
 * Amount in tenant reporting currency (minor units), or null if not convertible.
 * Uses immutable FX snapshot — never live rates.
 */
export function amountInBase(
	tx: Transaction,
	tenantBase: SupportedCurrency
): number | null {
	if (tx.currency === tenantBase) {
		return tx.amount_base ?? tx.amount;
	}
	if (tx.amount_base != null && (tx.base_currency === tenantBase || tx.base_currency == null)) {
		return tx.amount_base;
	}
	return null;
}

export function paidAmountInBase(
	tx: Transaction,
	tenantBase: SupportedCurrency
): number | null {
	const base = amountInBase(tx, tenantBase);
	if (base == null) return null;
	if (tx.paid_amount == null) return null;
	if (tx.amount <= 0) return 0;
	if (tx.currency === tenantBase) return tx.paid_amount;
	return Math.round((tx.paid_amount / tx.amount) * base);
}

export function isFxMissing(tx: Transaction, tenantBase: SupportedCurrency): boolean {
	return amountInBase(tx, tenantBase) == null;
}
