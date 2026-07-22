import { z } from 'zod';
import { moneyMinor } from '../../common.js';

export const adSimulatorInput = z.object({
	/** Cost per click in minor units (kuruş) */
	cpc: moneyMinor,
	/** Click → lead conversion rate as percentage (e.g. 5) */
	conversionRatePercent: z.number(),
	/** Lead → sale rate as percentage (e.g. 10) */
	salesRatePercent: z.number(),
	/** Contribution left from one sale before ad cost, in kuruş */
	contributionPerSale: moneyMinor,
	/** Fixed monthly cost in kuruş */
	fixedCostMonthly: moneyMinor,
	/** Optional cap: maximum monthly ad budget in kuruş */
	maxMonthlyBudget: moneyMinor.optional(),
	/** Optional cap: clicks available in the market per month */
	monthlyClickVolume: z.number().optional(),
	/** Optional goal: desired sales per month */
	targetSales: z.number().optional(),
	/** Max share of contribution ads may eat, as percentage (default 50) */
	maxAdShareOfContributionPercent: z.number().optional()
});
export type AdSimulatorInput = z.infer<typeof adSimulatorInput>;

export const trafficLightSchema = z.enum(['red', 'yellow', 'green', 'dark_green']);
export type TrafficLight = z.infer<typeof trafficLightSchema>;

export const scaleBottleneckSchema = z.enum(['budget', 'volume']);
export type ScaleBottleneck = z.infer<typeof scaleBottleneckSchema>;

export const adSimulatorScale = z.object({
	budgetCapSales: z.number().nullable(),
	volumeCapSales: z.number().nullable(),
	maxSales: z.number(),
	bottleneck: scaleBottleneckSchema,
	maxMonthlySpend: moneyMinor,
	monthlyProfitAtMax: moneyMinor,
	breakEvenReachable: z.boolean()
});
export type AdSimulatorScale = z.infer<typeof adSimulatorScale>;

export const adSimulatorTarget = z.object({
	targetSales: z.number(),
	requiredLeadsMonthly: z.number(),
	requiredClicksMonthly: z.number(),
	requiredClicksDaily: z.number(),
	requiredBudgetMonthly: moneyMinor,
	requiredBudgetDaily: moneyMinor,
	adSharePercent: z.number(),
	adCostCeiling: moneyMinor,
	withinHealthyTarget: z.boolean(),
	monthlyProfit: moneyMinor
});
export type AdSimulatorTarget = z.infer<typeof adSimulatorTarget>;

export const adSimulatorResult = z.object({
	endToEndRate: z.number(),
	clicksPerSale: z.number(),
	costPerLead: moneyMinor.nullable(),
	adCostPerSale: moneyMinor.nullable(),
	contributionAfterAds: moneyMinor.nullable(),
	lossThresholdRate: z.number(),
	healthyTargetRate: z.number(),
	trafficLight: trafficLightSchema,
	isViable: z.boolean(),
	breakEvenSales: z.number().nullable(),
	requiredBudget: moneyMinor.nullable(),
	requiredMonthlyClicks: z.number().nullable(),
	requiredDailyClicks: z.number().nullable(),
	scale: adSimulatorScale.nullable(),
	target: adSimulatorTarget.nullable()
});
export type AdSimulatorResult = z.infer<typeof adSimulatorResult>;
