import type { RealRoasInput, RealRoasResult } from './schema.js';

/**
 * Aggregate real ROAS from spend vs tahsilat (paid income).
 * Money inputs/outputs are integer minor units (kuruş).
 */
export function calculateRealRoas(input: RealRoasInput): RealRoasResult {
	const { spendMinor, revenueMinor, leads, treated } = input;

	return {
		realRoas: spendMinor > 0 ? revenueMinor / spendMinor : null,
		costPerLead: leads > 0 ? Math.round(spendMinor / leads) : null,
		costPerTreated: treated > 0 ? Math.round(spendMinor / treated) : null
	};
}
