import { minorOrNull } from '../money.js';
import type {
	AdSimulatorInput,
	AdSimulatorResult,
	AdSimulatorScale,
	AdSimulatorTarget,
	TrafficLight
} from './schema.js';

/** Internal scale before money presentation at the return boundary. */
type RawScale = {
	budgetCapSales: number | null;
	volumeCapSales: number | null;
	maxSales: number;
	bottleneck: AdSimulatorScale['bottleneck'];
	maxMonthlySpend: number;
	monthlyProfitAtMax: number;
	breakEvenReachable: boolean;
};

/** Internal target before money presentation at the return boundary. */
type RawTarget = {
	targetSales: number;
	requiredLeadsMonthly: number;
	requiredClicksMonthly: number;
	requiredClicksDaily: number;
	requiredBudgetMonthly: number;
	requiredBudgetDaily: number;
	adSharePercent: number;
	adCostCeiling: number;
	withinHealthyTarget: boolean;
	monthlyProfit: number;
};

function resolveTarget(
	input: AdSimulatorInput,
	endToEndRate: number,
	adCostPerSale: number,
	contributionAfterAds: number
): RawTarget | null {
	const { targetSales, salesRatePercent, fixedCostMonthly, contributionPerSale } = input;
	if (targetSales === undefined || targetSales <= 0 || endToEndRate <= 0) return null;

	const adSharePercent = input.maxAdShareOfContributionPercent ?? 50;
	const adCostCeiling = contributionPerSale * (adSharePercent / 100);

	const requiredLeadsMonthly = targetSales / (salesRatePercent / 100);
	const requiredClicksMonthly = targetSales / endToEndRate;
	const requiredBudgetMonthly = targetSales * adCostPerSale;

	return {
		targetSales,
		requiredLeadsMonthly,
		requiredClicksMonthly,
		requiredClicksDaily: requiredClicksMonthly / 30,
		requiredBudgetMonthly,
		requiredBudgetDaily: requiredBudgetMonthly / 30,
		adSharePercent,
		adCostCeiling,
		withinHealthyTarget: adCostPerSale <= adCostCeiling,
		monthlyProfit: targetSales * contributionAfterAds - fixedCostMonthly
	};
}

function resolveTrafficLight(endToEndRate: number, lossThresholdRate: number): TrafficLight {
	if (!Number.isFinite(lossThresholdRate) || endToEndRate < lossThresholdRate) return 'red';
	if (endToEndRate < 2 * lossThresholdRate) return 'yellow';
	if (endToEndRate < 3 * lossThresholdRate) return 'green';
	return 'dark_green';
}

function resolveScale(
	input: AdSimulatorInput,
	endToEndRate: number,
	adCostPerSale: number,
	contributionAfterAds: number,
	breakEvenSales: number
): RawScale | null {
	const { maxMonthlyBudget, monthlyClickVolume, fixedCostMonthly } = input;

	const budgetCapSales =
		maxMonthlyBudget !== undefined && adCostPerSale > 0
			? maxMonthlyBudget / adCostPerSale
			: null;
	const volumeCapSales =
		monthlyClickVolume !== undefined ? monthlyClickVolume * endToEndRate : null;

	if (budgetCapSales === null && volumeCapSales === null) return null;

	let maxSales: number;
	let bottleneck: AdSimulatorScale['bottleneck'];
	if (budgetCapSales !== null && (volumeCapSales === null || budgetCapSales <= volumeCapSales)) {
		maxSales = budgetCapSales;
		bottleneck = 'budget';
	} else {
		maxSales = volumeCapSales as number;
		bottleneck = 'volume';
	}

	return {
		budgetCapSales,
		volumeCapSales,
		maxSales,
		bottleneck,
		maxMonthlySpend: maxSales * adCostPerSale,
		monthlyProfitAtMax: maxSales * contributionAfterAds - fixedCostMonthly,
		breakEvenReachable: maxSales >= breakEvenSales
	};
}

/** Non-nullable money field: minorOrNull, caller guarantees finite. */
function presentMoney(value: number): number {
	const out = minorOrNull(value);
	if (out === null) {
		throw new Error('Expected finite money value at presentation boundary');
	}
	return out;
}

function presentScale(scale: RawScale | null): AdSimulatorScale | null {
	if (scale === null) return null;
	return {
		budgetCapSales: scale.budgetCapSales,
		volumeCapSales: scale.volumeCapSales,
		maxSales: scale.maxSales,
		bottleneck: scale.bottleneck,
		maxMonthlySpend: presentMoney(scale.maxMonthlySpend),
		monthlyProfitAtMax: presentMoney(scale.monthlyProfitAtMax),
		breakEvenReachable: scale.breakEvenReachable
	};
}

function presentTarget(target: RawTarget | null): AdSimulatorTarget | null {
	if (target === null) return null;
	return {
		targetSales: target.targetSales,
		requiredLeadsMonthly: target.requiredLeadsMonthly,
		requiredClicksMonthly: target.requiredClicksMonthly,
		requiredClicksDaily: target.requiredClicksDaily,
		requiredBudgetMonthly: presentMoney(target.requiredBudgetMonthly),
		requiredBudgetDaily: presentMoney(target.requiredBudgetDaily),
		adSharePercent: target.adSharePercent,
		adCostCeiling: presentMoney(target.adCostCeiling),
		withinHealthyTarget: target.withinHealthyTarget,
		monthlyProfit: presentMoney(target.monthlyProfit)
	};
}

/**
 * Ad-economics chain from RoasMate — pure TS, framework-agnostic.
 * Internal math uses raw numbers; money fields are presented via minorOrNull at return.
 */
export function calculateAdSimulation(input: AdSimulatorInput): AdSimulatorResult {
	const { cpc, conversionRatePercent, salesRatePercent, contributionPerSale, fixedCostMonthly } =
		input;

	const conversionRate = conversionRatePercent / 100;
	const salesRate = salesRatePercent / 100;
	const endToEndRate = conversionRate * salesRate;

	const clicksPerSale = endToEndRate > 0 ? 1 / endToEndRate : Infinity;
	const costPerLead = conversionRate > 0 ? cpc / conversionRate : Infinity;
	const adCostPerSale = endToEndRate > 0 ? cpc / endToEndRate : Infinity;
	const contributionAfterAds = contributionPerSale - adCostPerSale;

	const lossThresholdRate = contributionPerSale > 0 ? cpc / contributionPerSale : Infinity;
	const healthyTargetRate = 2 * lossThresholdRate;
	const trafficLight = resolveTrafficLight(endToEndRate, lossThresholdRate);

	const isViable = Number.isFinite(contributionAfterAds) && contributionAfterAds > 0;

	if (!isViable) {
		return {
			endToEndRate,
			clicksPerSale,
			costPerLead: minorOrNull(costPerLead),
			adCostPerSale: minorOrNull(adCostPerSale),
			contributionAfterAds: minorOrNull(contributionAfterAds),
			lossThresholdRate,
			healthyTargetRate,
			trafficLight,
			isViable,
			breakEvenSales: null,
			requiredBudget: null,
			requiredMonthlyClicks: null,
			requiredDailyClicks: null,
			scale: null,
			target: presentTarget(
				resolveTarget(input, endToEndRate, adCostPerSale, contributionAfterAds)
			)
		};
	}

	const breakEvenSales = fixedCostMonthly / contributionAfterAds;
	const requiredBudget = breakEvenSales * adCostPerSale;
	const requiredMonthlyClicks = breakEvenSales * clicksPerSale;

	return {
		endToEndRate,
		clicksPerSale,
		costPerLead: minorOrNull(costPerLead),
		adCostPerSale: minorOrNull(adCostPerSale),
		contributionAfterAds: minorOrNull(contributionAfterAds),
		lossThresholdRate,
		healthyTargetRate,
		trafficLight,
		isViable,
		breakEvenSales,
		requiredBudget: minorOrNull(requiredBudget),
		requiredMonthlyClicks,
		requiredDailyClicks: requiredMonthlyClicks / 30,
		scale: presentScale(
			resolveScale(input, endToEndRate, adCostPerSale, contributionAfterAds, breakEvenSales)
		),
		target: presentTarget(
			resolveTarget(input, endToEndRate, adCostPerSale, contributionAfterAds)
		)
	};
}
