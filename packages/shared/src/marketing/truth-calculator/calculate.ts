import { roundMinor } from '../money.js';
import type { ProfitStatus, TruthCalculatorInput, TruthCalculatorResult } from './schema.js';

const BREAK_EVEN_EPSILON = 0.001;

function resolveProfitStatus(realRoas: number): ProfitStatus {
	if (Math.abs(realRoas - 1) < BREAK_EVEN_EPSILON) return 'break_even';
	return realRoas > 1 ? 'profitable' : 'losing';
}

/**
 * Unit economics from RoasMate — pure TS, framework-agnostic.
 * Money outputs are integer minor units (kuruş).
 */
export function calculateTruthMetrics(input: TruthCalculatorInput): TruthCalculatorResult {
	const {
		platformRoas,
		salePrice,
		operationCost,
		commission,
		platformExtraFeePercent,
		targetMarginPercent
	} = input;

	const platformExtraFee = roundMinor(salePrice * (platformExtraFeePercent / 100));
	const contributionMargin = salePrice - operationCost - commission - platformExtraFee;
	const contributionRate = salePrice > 0 ? contributionMargin / salePrice : 0;
	const realRoas = platformRoas * contributionRate;
	const breakEvenRoas = contributionMargin > 0 ? salePrice / contributionMargin : Infinity;
	const impliedAdCost = roundMinor(platformRoas > 0 ? salePrice / platformRoas : 0);
	const netProfitPerCustomer = contributionMargin - impliedAdCost;

	const maxAdCostPerCustomer =
		targetMarginPercent !== undefined && targetMarginPercent >= 0
			? roundMinor(contributionMargin - salePrice * (targetMarginPercent / 100))
			: null;

	return {
		contributionMargin,
		contributionRate,
		realRoas,
		breakEvenRoas,
		maxAdCostPerCustomer,
		profitStatus: resolveProfitStatus(realRoas),
		impliedAdCost,
		netProfitPerCustomer
	};
}
