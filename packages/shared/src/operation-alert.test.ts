import { describe, expect, it } from 'vitest';
import {
	DEFAULT_OPERATION_ALERT_THRESHOLDS,
	deriveOperationAlertStatus,
	hoursUntil,
	operationAlertCreateSchema,
	operationAlertDueAtIso,
	parseOperationAlertThresholds
} from './operation-alert.js';

describe('operation-alert (AI-04, deterministic)', () => {
	it('defaults are flight 48 / transfer 24 / welcome 12 / clinic 24', () => {
		expect(DEFAULT_OPERATION_ALERT_THRESHOLDS).toEqual({
			flight: 48,
			transfer: 24,
			welcome: 12,
			clinic: 24
		});
	});

	it('parseOperationAlertThresholds falls back to defaults on garbage', () => {
		expect(parseOperationAlertThresholds(null)).toEqual(DEFAULT_OPERATION_ALERT_THRESHOLDS);
		expect(parseOperationAlertThresholds({ flight: 'nope' })).toEqual(
			DEFAULT_OPERATION_ALERT_THRESHOLDS
		);
	});

	it('parseOperationAlertThresholds accepts a full tenant override', () => {
		expect(parseOperationAlertThresholds({ flight: 72, transfer: 12, welcome: 6, clinic: 36 })).toEqual({
			flight: 72,
			transfer: 12,
			welcome: 6,
			clinic: 36
		});
	});

	it('due_at is starts_at minus threshold hours', () => {
		expect(operationAlertDueAtIso('2026-08-20T12:00:00.000Z', 48)).toBe(
			'2026-08-18T12:00:00.000Z'
		);
	});

	it('hoursUntil is negative when overdue', () => {
		const now = new Date('2026-08-17T12:00:00.000Z');
		expect(hoursUntil('2026-08-17T10:00:00.000Z', now)).toBe(-2);
		expect(hoursUntil('2026-08-17T18:00:00.000Z', now)).toBe(6);
	});

	it('deriveOperationAlertStatus: confirmed wins over due', () => {
		const now = new Date('2026-08-17T12:00:00.000Z');
		expect(deriveOperationAlertStatus('2026-08-16T00:00:00.000Z', '2026-08-17T10:00:00.000Z', now)).toBe(
			'confirmed'
		);
		expect(deriveOperationAlertStatus(null, '2026-08-17T10:00:00.000Z', now)).toBe('due');
		expect(deriveOperationAlertStatus(null, '2026-08-17T18:00:00.000Z', now)).toBe('upcoming');
	});

	it('create schema is strict (appointment + kind only)', () => {
		const ok = operationAlertCreateSchema.parse({
			appointment_id: '00000000-0000-4000-8000-000000000001',
			kind: 'flight'
		});
		expect(ok.kind).toBe('flight');
		expect(
			operationAlertCreateSchema.safeParse({
				appointment_id: '00000000-0000-4000-8000-000000000001',
				kind: 'flight',
				due_at: '2026-08-18T12:00:00.000Z'
			}).success
		).toBe(false);
	});
});
