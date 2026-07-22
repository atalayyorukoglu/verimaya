import { z } from 'zod';
import { moneyMinor } from '../../common.js';

export const truthCalculatorInput = z.object({
	/** Platform-reported ROAS (e.g. 3.3) */
	platformRoas: z.number(),
	/** Sale price in minor units (kuruş) */
	salePrice: moneyMinor,
	/** Operation cost in minor units (kuruş) */
	operationCost: moneyMinor,
	/** Commission in minor units (kuruş) */
	commission: moneyMinor,
	/** Platform extra fee as percentage 0–100 (e.g. 2) */
	platformExtraFeePercent: z.number(),
	/** Target net profit margin as percentage (optional, e.g. 15) */
	targetMarginPercent: z.number().optional()
});
export type TruthCalculatorInput = z.infer<typeof truthCalculatorInput>;

export const profitStatusSchema = z.enum(['profitable', 'losing', 'break_even']);
export type ProfitStatus = z.infer<typeof profitStatusSchema>;

export const truthCalculatorResult = z.object({
	contributionMargin: moneyMinor,
	contributionRate: z.number(),
	realRoas: z.number(),
	/** May be Infinity when contribution margin ≤ 0 */
	breakEvenRoas: z.number(),
	maxAdCostPerCustomer: moneyMinor.nullable(),
	profitStatus: profitStatusSchema,
	impliedAdCost: moneyMinor,
	netProfitPerCustomer: moneyMinor
});
export type TruthCalculatorResult = z.infer<typeof truthCalculatorResult>;
