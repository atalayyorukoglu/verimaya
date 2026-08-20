import { describe, expect, it } from 'vitest';
import { heuristicSuggestAppointmentReschedule } from './heuristic-reschedule-parse';
import type { LlmRescheduleAppointmentHint } from '../integrations/llm/llm.types';

const APPT_A: LlmRescheduleAppointmentHint = {
	appointment_id: '11111111-1111-4111-8111-111111111111',
	contact_display_name: 'Ayse Yilmaz',
	starts_at: '2026-09-01T10:00:00.000Z'
};

const APPT_A2: LlmRescheduleAppointmentHint = {
	appointment_id: '22222222-2222-4222-8222-222222222222',
	contact_display_name: 'Ayse Yilmaz',
	starts_at: '2026-09-10T14:00:00.000Z'
};

describe('heuristicSuggestAppointmentReschedule skipped_reason (AI-02 feedback)', () => {
	it('ambiguous_contact when the same patient has 2+ active appointments', () => {
		const result = heuristicSuggestAppointmentReschedule(
			'Ayse Yilmaz randevusunu 2026-09-15 14:00 tarihine alalim',
			[APPT_A, APPT_A2]
		);
		expect(result.drafts).toEqual([]);
		expect(result.skipped_reason).toBe('ambiguous_contact');
	});

	it('no_date when message has a patient but no parseable date', () => {
		const result = heuristicSuggestAppointmentReschedule(
			'Ayse Yilmaz randevusunu ertele',
			[APPT_A]
		);
		expect(result.drafts).toEqual([]);
		expect(result.skipped_reason).toBe('no_date');
	});

	it('no_change when suggested date equals current starts_at', () => {
		const result = heuristicSuggestAppointmentReschedule(
			'Ayse Yilmaz randevusunu 2026-09-01 10:00 tarihine alalim',
			[APPT_A]
		);
		expect(result.drafts).toEqual([]);
		expect(result.skipped_reason).toBe('no_change');
	});

	it('returns a draft and null skipped_reason for a clear single match', () => {
		const result = heuristicSuggestAppointmentReschedule(
			'Ayse Yilmaz randevusunu 2026-09-15 14:00 tarihine alalim',
			[APPT_A]
		);
		expect(result.skipped_reason).toBeNull();
		expect(result.drafts).toHaveLength(1);
		expect(result.drafts[0]).toMatchObject({
			appointment_id: APPT_A.appointment_id,
			suggested_value: '2026-09-15T14:00:00.000Z',
			confidence: 'medium'
		});
	});
});
