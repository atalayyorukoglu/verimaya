import { describe, expect, it } from 'vitest';
import {
	addCalendarDays,
	calendarDaysBetween,
	incentiveFileCreateSchema
} from './incentive-file.js';

describe('incentive-file helpers', () => {
	it('addCalendarDays crosses month boundaries', () => {
		expect(addCalendarDays('2026-01-15', 180)).toBe('2026-07-14');
		expect(addCalendarDays('2026-03-01', 30)).toBe('2026-03-31');
	});

	it('calendarDaysBetween is signed', () => {
		expect(calendarDaysBetween('2026-01-01', '2026-01-11')).toBe(10);
		expect(calendarDaysBetween('2026-01-11', '2026-01-01')).toBe(-10);
	});

	it('create schema rejects client deadline_at (strict)', () => {
		const parsed = incentiveFileCreateSchema.safeParse({
			contact_id: '00000000-0000-4000-8000-000000000001',
			payment_date: '2026-01-15',
			deadline_at: '2099-12-31'
		});
		expect(parsed.success).toBe(false);
	});
});
