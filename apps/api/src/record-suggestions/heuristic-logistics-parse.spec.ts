import { describe, expect, it } from 'vitest';
import { heuristicSuggestAppointmentLogistics } from './heuristic-logistics-parse';
import type { LlmLogisticsAppointmentHint } from '../integrations/llm/llm.types';

const DAWIT: LlmLogisticsAppointmentHint = {
	appointment_id: '11111111-1111-4111-8111-111111111111',
	contact_display_name: 'Dawit Abraham',
	starts_at: '2026-09-26T19:00:00.000Z',
	clinic: null,
	hotel: null,
	transfer: null
};

const LINDA: LlmLogisticsAppointmentHint = {
	appointment_id: '22222222-2222-4222-8222-222222222222',
	contact_display_name: 'Linda Wilson',
	starts_at: '2026-09-26T19:00:00.000Z',
	clinic: 'TNC',
	hotel: 'Dumos',
	transfer: null
};

describe('heuristicSuggestAppointmentLogistics', () => {
	it('gerçek biçim: "Ad Soyad + otel adı" tek satır', () => {
		// Gruptan aynen alındı (2026-09-14).
		const s = heuristicSuggestAppointmentLogistics('Dawit Abraham Alp paşa hotel', [
			DAWIT,
			LINDA
		]);
		expect(s.drafts).toHaveLength(1);
		expect(s.drafts[0]!.appointment_id).toBe(DAWIT.appointment_id);
		expect(s.drafts[0]!.field).toBe('hotel');
		// Hasta adı değerin içinde kalmamalı.
		expect(s.drafts[0]!.suggested_text).toBe('Alp paşa hotel');
	});

	it('klinik kelimesi klinik alanına gider', () => {
		const s = heuristicSuggestAppointmentLogistics('Dawit Abraham Estetik klinik', [DAWIT]);
		expect(s.drafts[0]!.field).toBe('clinic');
		expect(s.drafts[0]!.suggested_text).toBe('Estetik klinik');
	});

	it('havalimanı/transfer cümlesi transfer alanına gider', () => {
		const s = heuristicSuggestAppointmentLogistics(
			'Dawit Abraham icin havalimani transferi ayarlandi',
			[DAWIT]
		);
		expect(s.drafts[0]!.field).toBe('transfer');
	});

	it('iki hasta da eşleşirse öneri üretilmez', () => {
		const s = heuristicSuggestAppointmentLogistics('Dawit Abraham ve Linda Wilson ayni otelde', [
			DAWIT,
			LINDA
		]);
		expect(s.drafts).toEqual([]);
		expect(s.skipped_reason).toBe('ambiguous_contact');
	});

	it('hiç hasta eşleşmezse sessizce boş döner (sebep uydurulmaz)', () => {
		const s = heuristicSuggestAppointmentLogistics('Kemal Bey otele yerlesti', [DAWIT]);
		expect(s.drafts).toEqual([]);
		expect(s.skipped_reason).toBeNull();
	});

	it('anahtar kelime tek başına değer sayılmaz', () => {
		const s = heuristicSuggestAppointmentLogistics('Dawit Abraham otel', [DAWIT]);
		expect(s.drafts).toEqual([]);
		expect(s.skipped_reason).toBe('no_value');
	});

	it('zaten aynı olan değer için öneri açılmaz', () => {
		const s = heuristicSuggestAppointmentLogistics('Linda Wilson Dumos', [
			{ ...LINDA, hotel: 'Dumos' }
		]);
		// "Dumos" tek başına otel kelimesi taşımıyor → hiç işaret yok.
		expect(s.drafts).toEqual([]);
	});

	it('mevcut otelle birebir aynı yazılırsa değişiklik yok denir', () => {
		const s = heuristicSuggestAppointmentLogistics('Linda Wilson Dumos hotel', [
			{ ...LINDA, hotel: 'Dumos hotel' }
		]);
		expect(s.drafts).toEqual([]);
		expect(s.skipped_reason).toBe('no_change');
	});

	it('lojistik kelimesi yoksa hiç bakılmaz', () => {
		const s = heuristicSuggestAppointmentLogistics('Dawit Abraham 600 gbp yatirildi', [DAWIT]);
		expect(s.drafts).toEqual([]);
		expect(s.skipped_reason).toBeNull();
	});

	it('randevu listesi boşsa boş döner', () => {
		expect(heuristicSuggestAppointmentLogistics('Dawit Abraham Alp pasa hotel', []).drafts).toEqual(
			[]
		);
	});
});
