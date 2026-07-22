import { describe, expect, it } from 'vitest';
import { calculateAdSimulation } from './calculate.js';

const K = 100;

const BASE = {
	cpc: 250 * K,
	conversionRatePercent: 5,
	salesRatePercent: 10,
	contributionPerSale: 100_000 * K,
	fixedCostMonthly: 750_000 * K
};

describe('calculateAdSimulation golden scenarios', () => {
	it('BASE: doc example end to end (kuruş)', () => {
		const result = calculateAdSimulation(BASE);

		expect(result.endToEndRate).toBeCloseTo(0.005, 6);
		expect(result.clicksPerSale).toBeCloseTo(200, 5);
		expect(result.costPerLead).toBe(500_000);
		expect(result.adCostPerSale).toBe(5_000_000);
		expect(result.contributionAfterAds).toBe(5_000_000);
		expect(result.lossThresholdRate).toBeCloseTo(0.0025, 6);
		expect(result.trafficLight).toBe('green');
		expect(result.isViable).toBe(true);
		expect(result.breakEvenSales).toBeCloseTo(15, 5);
		expect(result.requiredBudget).toBe(75_000_000);
		expect(result.requiredMonthlyClicks).toBeCloseTo(3_000, 2);
		expect(result.requiredDailyClicks).toBeCloseTo(100, 2);
		expect(result.scale).toBeNull();
	});

	it('BETTER: higher funnel rates → dark_green', () => {
		const result = calculateAdSimulation({
			...BASE,
			conversionRatePercent: 6,
			salesRatePercent: 12.5
		});

		expect(result.endToEndRate).toBeCloseTo(0.0075, 6);
		expect(result.trafficLight).toBe('dark_green');
		expect(result.adCostPerSale).toBe(3_333_333);
		expect(result.contributionAfterAds).toBe(6_666_667);
		expect(result.breakEvenSales).toBeCloseTo(11.25, 3);
		expect(result.requiredBudget).toBe(37_500_000);
		expect(result.requiredDailyClicks).toBeCloseTo(50, 1);
	});

	it('RED: below loss threshold, not viable', () => {
		const result = calculateAdSimulation({
			...BASE,
			conversionRatePercent: 4,
			salesRatePercent: 5
		});

		expect(result.endToEndRate).toBeCloseTo(0.002, 6);
		expect(result.trafficLight).toBe('red');
		expect(result.contributionAfterAds).toBe(-2_500_000);
		expect(result.isViable).toBe(false);
		expect(result.breakEvenSales).toBeNull();
		expect(result.requiredBudget).toBeNull();
		expect(result.scale).toBeNull();
	});

	it('ZEROCONV: no divide-by-zero; money → null', () => {
		const result = calculateAdSimulation({ ...BASE, conversionRatePercent: 0 });

		expect(result.endToEndRate).toBe(0);
		expect(result.clicksPerSale).toBe(Infinity);
		expect(result.costPerLead).toBeNull();
		expect(result.adCostPerSale).toBeNull();
		expect(result.isViable).toBe(false);
		expect(result.trafficLight).toBe('red');
	});
});

describe('scale analysis (para testi + hacim testi)', () => {
	it('VOL: volume bottleneck', () => {
		const result = calculateAdSimulation({
			...BASE,
			maxMonthlyBudget: 1_000_000 * K,
			monthlyClickVolume: 3_000
		});

		expect(result.scale).not.toBeNull();
		const scale = result.scale!;
		expect(scale.budgetCapSales).toBeCloseTo(20, 5);
		expect(scale.volumeCapSales).toBeCloseTo(15, 5);
		expect(scale.bottleneck).toBe('volume');
		expect(scale.maxSales).toBeCloseTo(15, 5);
		expect(scale.maxMonthlySpend).toBe(75_000_000);
		expect(scale.monthlyProfitAtMax).toBe(0);
		expect(scale.breakEvenReachable).toBe(true);
	});

	it('BUD: budget bottleneck, break-even out of reach', () => {
		const result = calculateAdSimulation({
			...BASE,
			maxMonthlyBudget: 500_000 * K
		});

		const scale = result.scale!;
		expect(scale.bottleneck).toBe('budget');
		expect(scale.volumeCapSales).toBeNull();
		expect(scale.maxSales).toBeCloseTo(10, 5);
		expect(scale.monthlyProfitAtMax).toBe(-25_000_000);
		expect(scale.breakEvenReachable).toBe(false);
	});

	it('AMPLE: budget binds, profit past break-even', () => {
		const result = calculateAdSimulation({
			...BASE,
			maxMonthlyBudget: 1_000_000 * K,
			monthlyClickVolume: 6_000
		});

		const scale = result.scale!;
		expect(scale.bottleneck).toBe('budget');
		expect(scale.maxSales).toBeCloseTo(20, 5);
		expect(scale.monthlyProfitAtMax).toBe(25_000_000);
		expect(scale.breakEvenReachable).toBe(true);
	});
});

describe('target plan (hedef satış → bütçe)', () => {
	it('TARGET null when targetSales not provided', () => {
		expect(calculateAdSimulation(BASE).target).toBeNull();
	});

	it('TARGET_OK: budget backwards from target', () => {
		const result = calculateAdSimulation({
			cpc: 250 * K,
			conversionRatePercent: 6,
			salesRatePercent: 9,
			contributionPerSale: 100_000 * K,
			fixedCostMonthly: 0,
			targetSales: 15
		});

		const target = result.target!;
		expect(target.targetSales).toBe(15);
		expect(target.requiredLeadsMonthly).toBeCloseTo(166.67, 1);
		expect(target.requiredBudgetMonthly).toBe(69_444_444);
		expect(target.adCostCeiling).toBe(5_000_000);
		expect(target.withinHealthyTarget).toBe(true);
		expect(target.monthlyProfit).toBe(80_555_556);
		expect(result.adCostPerSale).toBe(4_629_630);
	});

	it('TARGET_50VIOL: %50 rule violated', () => {
		const result = calculateAdSimulation({
			cpc: 250 * K,
			conversionRatePercent: 5.65,
			salesRatePercent: 5,
			contributionPerSale: 100_000 * K,
			fixedCostMonthly: 0,
			targetSales: 15
		});

		const target = result.target!;
		expect(result.adCostPerSale).toBe(8_849_558);
		expect(target.withinHealthyTarget).toBe(false);
		expect(target.requiredBudgetMonthly).toBe(132_743_363);
	});

	it('TARGET_40: custom ad-share ceiling', () => {
		const base = {
			cpc: 250 * K,
			conversionRatePercent: 6,
			salesRatePercent: 9,
			contributionPerSale: 100_000 * K,
			fixedCostMonthly: 0,
			targetSales: 15
		};
		expect(calculateAdSimulation(base).target!.withinHealthyTarget).toBe(true);

		const strict = calculateAdSimulation({ ...base, maxAdShareOfContributionPercent: 40 });
		expect(strict.target!.adSharePercent).toBe(40);
		expect(strict.target!.adCostCeiling).toBe(4_000_000);
		expect(strict.target!.withinHealthyTarget).toBe(false);
	});

	it('TARGET_NOTVIABLE: still answers budget when funnel not viable', () => {
		const result = calculateAdSimulation({
			...BASE,
			conversionRatePercent: 4,
			salesRatePercent: 5,
			targetSales: 10
		});

		expect(result.isViable).toBe(false);
		const target = result.target!;
		expect(target.requiredBudgetMonthly).toBe(125_000_000);
		expect(target.withinHealthyTarget).toBe(false);
		expect(target.monthlyProfit).toBeLessThan(0);
	});
});
