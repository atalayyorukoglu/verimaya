import { z } from 'zod';
import { cursorPageSchema, isoDateTime, uuid } from './common.js';

/**
 * AI-04 / AI-04b — time-locked operation alerts.
 *
 * Deterministic: due_at = appointment.starts_at − threshold hours.
 * No model, no LLM, no prediction. A rule fires when the clock says so.
 * Per-kind `{ hours, enabled }` is tenant-configurable; confirmed rows are never
 * rewritten by a settings change.
 */

export const OPERATION_ALERT_THRESHOLDS_KEY = 'operation_alert_thresholds';

export const operationAlertKindSchema = z.enum(['flight', 'transfer', 'welcome', 'clinic']);
export type OperationAlertKind = z.infer<typeof operationAlertKindSchema>;

export const OPERATION_ALERT_KINDS = operationAlertKindSchema.options;

export const OPERATION_ALERT_THRESHOLD_HOURS_MIN = 1;
export const OPERATION_ALERT_THRESHOLD_HOURS_MAX = 8760;

export const operationAlertKindSettingSchema = z.object({
	hours: z.number().int().min(OPERATION_ALERT_THRESHOLD_HOURS_MIN).max(OPERATION_ALERT_THRESHOLD_HOURS_MAX),
	enabled: z.boolean()
});
export type OperationAlertKindSetting = z.infer<typeof operationAlertKindSettingSchema>;

/** Hours before appointment.starts_at when the alert becomes due, plus on/off. */
export const DEFAULT_OPERATION_ALERT_THRESHOLDS = {
	flight: { hours: 48, enabled: true },
	transfer: { hours: 24, enabled: true },
	welcome: { hours: 12, enabled: true },
	clinic: { hours: 24, enabled: true }
} as const satisfies Record<OperationAlertKind, OperationAlertKindSetting>;

export type OperationAlertThresholds = Record<OperationAlertKind, OperationAlertKindSetting>;

export const operationAlertThresholdsSchema = z.object({
	flight: operationAlertKindSettingSchema,
	transfer: operationAlertKindSettingSchema,
	welcome: operationAlertKindSettingSchema,
	clinic: operationAlertKindSettingSchema
});

/** Pre-AI-04b persisted shape: kind → hours (implied enabled: true). */
const operationAlertThresholdsLegacySchema = z.object({
	flight: z.number().int().min(OPERATION_ALERT_THRESHOLD_HOURS_MIN).max(OPERATION_ALERT_THRESHOLD_HOURS_MAX),
	transfer: z.number().int().min(OPERATION_ALERT_THRESHOLD_HOURS_MIN).max(OPERATION_ALERT_THRESHOLD_HOURS_MAX),
	welcome: z.number().int().min(OPERATION_ALERT_THRESHOLD_HOURS_MIN).max(OPERATION_ALERT_THRESHOLD_HOURS_MAX),
	clinic: z.number().int().min(OPERATION_ALERT_THRESHOLD_HOURS_MIN).max(OPERATION_ALERT_THRESHOLD_HOURS_MAX)
});

export function cloneOperationAlertThresholds(
	value: OperationAlertThresholds
): OperationAlertThresholds {
	return {
		flight: { ...value.flight },
		transfer: { ...value.transfer },
		welcome: { ...value.welcome },
		clinic: { ...value.clinic }
	};
}

export function defaultOperationAlertThresholds(): OperationAlertThresholds {
	return cloneOperationAlertThresholds(DEFAULT_OPERATION_ALERT_THRESHOLDS);
}

export function operationAlertThresholdsEqual(
	a: OperationAlertThresholds,
	b: OperationAlertThresholds
): boolean {
	return OPERATION_ALERT_KINDS.every(
		(kind) => a[kind].hours === b[kind].hours && a[kind].enabled === b[kind].enabled
	);
}

function fromLegacyHours(legacy: z.infer<typeof operationAlertThresholdsLegacySchema>): OperationAlertThresholds {
	return {
		flight: { hours: legacy.flight, enabled: true },
		transfer: { hours: legacy.transfer, enabled: true },
		welcome: { hours: legacy.welcome, enabled: true },
		clinic: { hours: legacy.clinic, enabled: true }
	};
}

export function parseOperationAlertThresholds(raw: unknown): OperationAlertThresholds {
	const modern = operationAlertThresholdsSchema.safeParse(raw);
	if (modern.success) return cloneOperationAlertThresholds(modern.data);
	const legacy = operationAlertThresholdsLegacySchema.safeParse(raw);
	if (legacy.success) return fromLegacyHours(legacy.data);
	return defaultOperationAlertThresholds();
}

export const operationAlertSettingsSchema = z.object({
	thresholds: operationAlertThresholdsSchema,
	is_default: z.boolean()
});
export type OperationAlertSettings = z.infer<typeof operationAlertSettingsSchema>;

export const operationAlertSettingsUpdateSchema = z
	.object({
		thresholds: operationAlertThresholdsSchema
	})
	.strict();
export type OperationAlertSettingsUpdate = z.infer<typeof operationAlertSettingsUpdateSchema>;

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
