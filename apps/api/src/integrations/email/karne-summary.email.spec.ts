import { describe, expect, it } from 'vitest';
import { buildKarneSummaryEmail } from './karne-summary.email';

describe('buildKarneSummaryEmail', () => {
	it('includes zero headline and weak/strong lists', () => {
		const { subject, text, html } = buildKarneSummaryEmail({
			zero_count: 3,
			answered_count: 10,
			top_weak: ['Kanıt yok: ölçüm', 'Kanıt yok: rıza'],
			strong_titles: ['Güçlü alan'],
			eu_exposure: true
		});
		expect(subject).toMatch(/Verimaya/);
		expect(text).toContain("10 sorudan 3'inde");
		expect(text).toContain('Kanıt yok: ölçüm');
		expect(text).toContain('EU AI Act');
		expect(html).toContain('Kanıt yok: rıza');
		expect(html).not.toContain('<script');
	});

	it('escapes HTML in user-facing labels', () => {
		const { html } = buildKarneSummaryEmail({
			zero_count: 1,
			answered_count: 10,
			top_weak: ['<img onerror=alert(1)>'],
			strong_titles: [],
			eu_exposure: false
		});
		expect(html).toContain('&lt;img');
		expect(html).not.toContain('<img onerror');
	});
});
