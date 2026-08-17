import { z } from 'zod';
import { isoDateTime } from './common.js';

/** Persisted tenant_settings key = `incentive_deadline_days`. */
export const INCENTIVE_DEADLINE_DAYS_KEY = 'incentive_deadline_days';

/**
 * Default only — not a legal claim. Tenants can change this; existing files keep
 * their stored `deadline_at`.
 */
export const DEFAULT_INCENTIVE_DEADLINE_DAYS = 180;

export const incentiveDeadlineSettingsSchema = z.object({
	days: z.number().int().min(1).max(3650),
	is_default: z.boolean(),
	updated_by: z.string().max(255).nullable(),
	updated_at: isoDateTime.nullable()
});

export type IncentiveDeadlineSettings = z.infer<typeof incentiveDeadlineSettingsSchema>;

export const incentiveDeadlineSettingsUpdateSchema = z.object({
	days: z.number().int().min(1).max(3650)
});

export type IncentiveDeadlineSettingsUpdate = z.infer<typeof incentiveDeadlineSettingsUpdateSchema>;

export function defaultIncentiveDeadlineSettings(): IncentiveDeadlineSettings {
	return {
		days: DEFAULT_INCENTIVE_DEADLINE_DAYS,
		is_default: true,
		updated_by: null,
		updated_at: null
	};
}
