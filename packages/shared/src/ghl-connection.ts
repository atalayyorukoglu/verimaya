import { z } from 'zod';

export const ghlConnectionStatus = z.object({
	connected: z.boolean(),
	key_version: z.number().int().nullable(),
	location_id: z.string().nullable(),
	user_type: z.enum(['Location', 'Company']).nullable()
});
export type GhlConnectionStatus = z.infer<typeof ghlConnectionStatus>;

export const ghlOAuthCallbackQuery = z.object({
	code: z.string().min(1),
	state: z.string().min(1)
});
export type GhlOAuthCallbackQuery = z.infer<typeof ghlOAuthCallbackQuery>;

/** Manual POST /integrations/ghl/reconcile — job accepted by BullMQ (worker will run). */
export const ghlReconcileQueuedResult = z.object({
	status: z.literal('queued'),
	job_id: z.string().min(1),
	already_queued: z.boolean()
});
export type GhlReconcileQueuedResult = z.infer<typeof ghlReconcileQueuedResult>;

/**
 * Manual reconcile finished inline (queue unavailable). Counts mirror GhlReconcileService.
 * Diffs stay server-side in the jobs ledger — not returned on the HTTP surface.
 */
export const ghlReconcileCompletedResult = z.object({
	status: z.literal('completed'),
	mode: z.enum(['live', 'skipped_no_oauth', 'skipped_no_app_credentials']),
	lookback_days: z.number().int().positive(),
	scanned: z.number().int().nonnegative(),
	created: z.number().int().nonnegative(),
	updated: z.number().int().nonnegative(),
	unchanged: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	diff_count: z.number().int().nonnegative()
});
export type GhlReconcileCompletedResult = z.infer<typeof ghlReconcileCompletedResult>;

export const ghlReconcileTriggerResult = z.discriminatedUnion('status', [
	ghlReconcileQueuedResult,
	ghlReconcileCompletedResult
]);
export type GhlReconcileTriggerResult = z.infer<typeof ghlReconcileTriggerResult>;
