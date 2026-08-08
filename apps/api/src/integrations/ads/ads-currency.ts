import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@verimaya/shared';

/** Ads account currencies we can store; never invent a default. */
export function parseAdsCurrency(
	raw: string | null | undefined,
	source: string
): SupportedCurrency {
	const code = (raw ?? '').trim().toUpperCase();
	if ((SUPPORTED_CURRENCIES as readonly string[]).includes(code)) {
		return code as SupportedCurrency;
	}
	throw new Error(
		`${source}: unsupported or missing currency ${JSON.stringify(raw)} — expected one of ${SUPPORTED_CURRENCIES.join(', ')}`
	);
}
