import { describe, expect, it } from 'vitest';
import {
	contactVisitCreateFromDraft,
	contactVisitDateRangeLabel,
	contactVisitTypeLabels,
	contactVisitTypeSchema,
	contactVisitUpdateSchema
} from './contact-visit.js';

describe('contactVisitTypeLabels', () => {
	it('her tür için Türkçe etiket var', () => {
		for (const ty of contactVisitTypeSchema.options) {
			expect(contactVisitTypeLabels[ty]).toBeTruthy();
		}
		expect(contactVisitTypeLabels.visit_2).toBe('2. vizit');
		expect(contactVisitTypeLabels.rpt).toBe('RPT');
	});
});

describe('contactVisitDateRangeLabel', () => {
	it('saat biliniyorsa saati de yazar', () => {
		expect(
			contactVisitDateRangeLabel({
				arrival_at: '2026-09-13T21:35:00.000Z',
				arrival_time_known: true,
				departure_at: '2026-09-19T22:15:00.000Z',
				departure_time_known: true
			})
		).toContain('21:35');
	});

	it('saat bilinmiyorsa uydurma 00:00 yazmaz', () => {
		const label = contactVisitDateRangeLabel({
			arrival_at: '2026-04-26T00:00:00.000Z',
			arrival_time_known: false,
			departure_at: null,
			departure_time_known: false
		});
		expect(label).not.toContain('00:00');
		expect(label).toContain('2026');
	});

	it('iki tarih de yoksa boş döner', () => {
		expect(
			contactVisitDateRangeLabel({
				arrival_at: null,
				arrival_time_known: false,
				departure_at: null,
				departure_time_known: false
			})
		).toBe('');
	});
});

describe('contactVisitCreateFromDraft', () => {
	it('taslağı planlanmış vizit gövdesine çevirir', () => {
		const create = contactVisitCreateFromDraft({
			visit_type: 'rpt',
			sequence: null,
			arrival_at: '2026-10-01T10:00:00.000Z',
			arrival_time_known: true,
			departure_at: null,
			departure_time_known: false,
			hotel: 'Dumos',
			clinic: 'Dentgroup',
			doctor: null,
			treatment_plan: null
		});
		expect(create.status).toBe('planned');
		expect(create.visit_type).toBe('rpt');
		expect(create.hotel).toBe('Dumos');
		expect(create.departure_at).toBeNull();
	});
});

describe('contactVisitUpdateSchema', () => {
	it('kaynak mesaj alanı PATCH ile değiştirilemez', () => {
		const parsed = contactVisitUpdateSchema.safeParse({
			source_inbound_message_id: '00000000-0000-4000-8000-000000000000'
		});
		expect(parsed.success).toBe(false);
	});

	it('tek alan güncellemeye izin verir', () => {
		expect(contactVisitUpdateSchema.safeParse({ status: 'completed' }).success).toBe(true);
	});
});
