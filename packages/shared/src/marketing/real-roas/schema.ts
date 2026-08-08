import { z } from 'zod';
import { moneyMinor } from '../../common.js';

export const realRoasInput = z.object({
	spendMinor: moneyMinor,
	revenueMinor: moneyMinor,
	leads: z.number().int().nonnegative(),
	treated: z.number().int().nonnegative()
});
export type RealRoasInput = z.infer<typeof realRoasInput>;

export const realRoasResult = z.object({
	/** revenue/spend; spend 0 → null */
	realRoas: z.number().nullable(),
	/** spend/leads; leads 0 → null */
	costPerLead: moneyMinor.nullable(),
	/** spend/treated; treated 0 → null */
	costPerTreated: moneyMinor.nullable()
});
export type RealRoasResult = z.infer<typeof realRoasResult>;
