export type TxAmountRow = {
	kind: string;
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

export function resolvePaidBaseAmount(row: TxAmountRow, tenantBase: string): number | null {
	const base = resolveBaseAmount(row, tenantBase);
	if (base == null || row.paidAmount == null) return null;
	if (row.amount <= 0) return 0;
	if (row.currency === tenantBase) return row.paidAmount;
	return Math.round((row.paidAmount / row.amount) * base);
}
