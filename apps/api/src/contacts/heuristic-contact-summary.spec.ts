import { describe, expect, it } from 'vitest';
import { heuristicSummarizeContact } from './heuristic-contact-summary';

describe('heuristicSummarizeContact', () => {
	it('kayıt yoksa boş', () => {
		expect(heuristicSummarizeContact({ items: [], subjectToken: '[HASTA]' })).toEqual([]);
	});

	it('türe göre sayar, her cümle ref taşır, tarih sırasını kendisi kurar', () => {
		const out = heuristicSummarizeContact({
			subjectToken: '[HASTA]',
			items: [
				{ ref: 'P1', kind: 'transaction', at: '2026-09-02T00:00:00.000Z', text: 'Gelir 2.400 GBP' },
				{
					ref: 'W1',
					kind: 'whatsapp',
					at: '2026-08-24T10:00:00.000Z',
					text: 'Muhasebe: [HASTA] RPT'
				},
				{ ref: 'R1', kind: 'appointment', at: '2026-08-31T21:00:00.000Z', text: 'Randevu RPT' }
			]
		});
		expect(out[0]).toEqual({
			text: 'İlk kayıt 24 Ağustos 2026, son kayıt 2 Eylül 2026; toplam 3 kayıt.',
			refs: ['W1', 'P1']
		});
		expect(out.map((s) => s.refs)).toEqual([['W1', 'P1'], ['R1'], ['P1'], ['W1']]);
		for (const s of out) expect(s.refs.length).toBeGreaterThan(0);
	});
});
