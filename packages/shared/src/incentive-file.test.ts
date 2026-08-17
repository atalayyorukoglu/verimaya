import { describe, expect, it } from 'vitest';
import {
	INCENTIVE_DOCUMENTS_MAX,
	addCalendarDays,
	calendarDaysBetween,
	incentiveFileCreateSchema,
	incentiveFileUpdateSchema
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

	it('update schema rejects duplicate document keys', () => {
		const parsed = incentiveFileUpdateSchema.safeParse({
			documents: [
				{ key: 'contract', label: 'Sözleşme', done: false },
				{ key: 'contract', label: 'Başka sözleşme', done: true }
			]
		});
		expect(parsed.success).toBe(false);
	});

	it('update schema rejects empty document label', () => {
		const parsed = incentiveFileUpdateSchema.safeParse({
			documents: [{ key: 'contract', label: '', done: false }]
		});
		expect(parsed.success).toBe(false);
	});

	it('update schema rejects whitespace-only document label', () => {
		const parsed = incentiveFileUpdateSchema.safeParse({
			documents: [{ key: 'contract', label: '   ', done: false }]
		});
		expect(parsed.success).toBe(false);
	});

	it('update schema rejects more than 30 documents', () => {
		const documents = Array.from({ length: INCENTIVE_DOCUMENTS_MAX + 1 }, (_, i) => ({
			key: `doc_${i}`,
			label: `Belge ${i + 1}`,
			done: false
		}));
		const parsed = incentiveFileUpdateSchema.safeParse({ documents });
		expect(parsed.success).toBe(false);
	});

	it('update schema accepts 30 unique named documents', () => {
		const documents = Array.from({ length: INCENTIVE_DOCUMENTS_MAX }, (_, i) => ({
			key: `doc_${i}`,
			label: `Belge ${i + 1}`,
			done: false
		}));
		const parsed = incentiveFileUpdateSchema.safeParse({ documents });
		expect(parsed.success).toBe(true);
	});
});
