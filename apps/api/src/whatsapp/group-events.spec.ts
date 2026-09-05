import { describe, expect, it } from 'vitest';
import type { InboundMessage } from '@verimaya/shared';
import { groupInboundMessages } from './group-events';

function message(overrides: Partial<InboundMessage> & { id: string }): InboundMessage {
	return {
		tenant_id: '00000000-0000-4000-8000-000000000001',
		chat_name: 'Klinik Muhasebe',
		chat_id: '905550000000-1600000000@g.us',
		sender: '905551112233@c.us',
		body: null,
		has_media: false,
		media_path: null,
		status: 'parsed',
		parsed_records: null,
		parse_error: null,
		group_id: null,
		created_at: '2026-09-01T11:02:00.000Z',
		...overrides
	};
}

function draft(amount: number, currency: 'TRY' | 'EUR' = 'TRY') {
	return {
		kind: 'expense' as const,
		amount,
		currency,
		title: 'Ada Klinik',
		occurred_on: '2026-09-01'
	};
}

// Kimlikler okunabilir olsun diye uuid degil — gruplama id'yi yorumlamaz.
const A = 'msg-a';
const B = 'msg-b';
const C = 'msg-c';

describe('AI-13 olay gruplama', () => {
	it('ayni sohbet + 15 dk + ayni tutar tek gruba girer', () => {
		const result = groupInboundMessages([
			message({ id: A, created_at: '2026-09-01T11:02:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: B, created_at: '2026-09-01T11:03:00.000Z', parsed_records: [draft(167_600)] })
		]);

		expect(result.map((m) => m.group_id)).toEqual([A, A]);
	});

	it('grup kimligi en eski mesajin id"si — liste sirasi ne olursa olsun', () => {
		const result = groupInboundMessages([
			message({ id: B, created_at: '2026-09-01T11:03:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: A, created_at: '2026-09-01T11:02:00.000Z', parsed_records: [draft(167_600)] })
		]);

		expect(result.find((m) => m.id === B)?.group_id).toBe(A);
		expect(result.find((m) => m.id === A)?.group_id).toBe(A);
	});

	it('15 dakikayi asan mesaj ayri olaydir', () => {
		const result = groupInboundMessages([
			message({ id: A, created_at: '2026-09-01T11:02:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: B, created_at: '2026-09-01T11:18:00.000Z', parsed_records: [draft(167_600)] })
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('farkli sohbet ayni tutar gruplanmaz', () => {
		const result = groupInboundMessages([
			message({ id: A, parsed_records: [draft(167_600)] }),
			message({
				id: B,
				chat_id: 'baska-sohbet@g.us',
				created_at: '2026-09-01T11:03:00.000Z',
				parsed_records: [draft(167_600)]
			})
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('tutar farkliysa gruplanmaz', () => {
		const result = groupInboundMessages([
			message({ id: A, parsed_records: [draft(167_600)] }),
			message({
				id: B,
				created_at: '2026-09-01T11:03:00.000Z',
				parsed_records: [draft(50_000)]
			})
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('para birimi farkliysa ayni sayi gruplamaz', () => {
		const result = groupInboundMessages([
			message({ id: A, parsed_records: [draft(167_600, 'TRY')] }),
			message({
				id: B,
				created_at: '2026-09-01T11:03:00.000Z',
				parsed_records: [draft(167_600, 'EUR')]
			})
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('ayristirilamamis mesaj (tutar yok) gruba girmez', () => {
		const result = groupInboundMessages([
			message({ id: A, parsed_records: [draft(167_600)] }),
			message({
				id: B,
				created_at: '2026-09-01T11:03:00.000Z',
				parsed_records: null,
				parse_error: 'Ayrıştırılamadı'
			})
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('sohbet kimligi yoksa gruplanmaz', () => {
		const result = groupInboundMessages([
			message({ id: A, chat_id: null, parsed_records: [draft(167_600)] }),
			message({
				id: B,
				chat_id: null,
				created_at: '2026-09-01T11:03:00.000Z',
				parsed_records: [draft(167_600)]
			})
		]);

		expect(result.every((m) => m.group_id === null)).toBe(true);
	});

	it('ucuncu mesaj da ayni gruba katilir; pencere ilk mesajdan olculur', () => {
		const result = groupInboundMessages([
			message({ id: A, created_at: '2026-09-01T11:02:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: B, created_at: '2026-09-01T11:03:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: C, created_at: '2026-09-01T11:14:00.000Z', parsed_records: [draft(167_600)] })
		]);

		expect(result.map((m) => m.group_id)).toEqual([A, A, A]);
	});

	it('girdi listesinin sirasi ve uzunlugu korunur', () => {
		const input = [
			message({ id: C, created_at: '2026-09-01T12:00:00.000Z' }),
			message({ id: A, created_at: '2026-09-01T11:02:00.000Z', parsed_records: [draft(167_600)] }),
			message({ id: B, created_at: '2026-09-01T11:03:00.000Z', parsed_records: [draft(167_600)] })
		];

		expect(groupInboundMessages(input).map((m) => m.id)).toEqual([C, A, B]);
	});
});
