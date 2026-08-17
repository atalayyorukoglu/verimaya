import { z } from 'zod';
import { cursorPageSchema, isoDateTime, uuid } from './common.js';

/**
 * AI-04 — time-locked operation alerts.
 *
 * Deterministic: due_at = appointment.starts_at − threshold_hours.
 * No model, no LLM, no prediction. A rule fires when the clock says so.
 */

export const OPERATION_ALERT_THRESHOLDS_KEY = 'operation_alert_thresholds';

export const operationAlertKindSchema = z.enum(['flight', 'transfer', 'welcome', 'clinic']);
export type OperationAlertKind = z.infer<typeof operationAlertKindSchema>;

export const OPERATION_ALERT_KINDS = operationAlertKindSchema.options;

/** Hours before appointment.starts_at when the alert becomes due. */
export const DEFAULT_OPERATION_ALERT_THRESHOLDS = {
	flight: 48,
	transfer: 24,
	welcome: 12,
	clinic: 24
} as const satisfies Record<OperationAlertKind, number>;

export type OperationAlertThresholds = Record<OperationAlertKind, number>;

export const operationAlertThresholdsSchema = z.object({
	flight: z.number().int().min(1).max(8760),
	transfer: z.number().int().min(1).max(8760),
	welcome: z.number().int().min(1).max(8760),
	clinic: z.number().int().min(1).max(8760)
});

export function parseOperationAlertThresholds(raw: unknown): OperationAlertThresholds {
	const parsed = operationAlertThresholdsSchema.safeParse(raw);
	if (!parsed.success) {
		return { ...DEFAULT_OPERATION_ALERT_THRESHOLDS };
	}
	return parsed.data;
}

/** List/query status — derived, not stored. */
export const operationAlertStatusSchema = z.enum(['due', 'upcoming', 'confirmed']);
export type OperationAlertStatus = z.infer<typeof operationAlertStatusSchema>;

export const operationAlertSchema = z.object({
	id: uuid,
	tenant_id: uuid,
	appointment_id: uuid,
	contact_display_name: z.string().min(1).max(255),
	appointment_starts_at: isoDateTime,
	kind: operationAlertKindSchema,
	due_at: isoDateTime,
	threshold_hours: z.number().int().min(1).max(8760),
	/**
	 * Whole hours from now until due_at (floor). Negative when overdue.
	 * 30 min overdue → -1; 5.9 h remaining → 5.
	 */
	hours_left: z.number().int(),
	status: operationAlertStatusSchema,
	confirmed_at: isoDateTime.nullable(),
	confirmed_by: z.string().max(255).nullable(),
	created_at: isoDateTime,
	updated_at: isoDateTime
});

export type OperationAlert = z.infer<typeof operationAlertSchema>;

export const operationAlertCreateSchema = z
	.object({
		appointment_id: uuid,
		kind: operationAlertKindSchema
	})
	.strict();

export type OperationAlertCreate = z.infer<typeof operationAlertCreateSchema>;

export const operationAlertListPageSchema = cursorPageSchema(operationAlertSchema);
export type OperationAlertListPage = z.infer<typeof operationAlertListPageSchema>;

export function operationAlertDueAtIso(startsAtIso: string, thresholdHours: number): string {
	return new Date(new Date(startsAtIso).getTime() - thresholdHours * 3_600_000).toISOString();
}

export function operationAlertDueAt(startsAt: Date, thresholdHours: number): Date {
	return new Date(startsAt.getTime() - thresholdHours * 3_600_000);
}

/** Signed whole hours until due_at. Negative when overdue. */
export function hoursUntil(dueAtIso: string, now: Date = new Date()): number {
	return Math.floor((new Date(dueAtIso).getTime() - now.getTime()) / 3_600_000);
}

export function deriveOperationAlertStatus(
	confirmedAt: string | null,
	dueAtIso: string,
	now: Date = new Date()
): OperationAlertStatus {
	if (confirmedAt) return 'confirmed';
	return new Date(dueAtIso).getTime() <= now.getTime() ? 'due' : 'upcoming';
}
