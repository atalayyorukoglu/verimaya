import { describe, expect, it } from 'vitest';
import { buildUtmUrl, split322, split603010 } from './builders.js';

describe('templates builders', () => {
	it('builds utm urls', () => {
		const url = buildUtmUrl({
			baseUrl: 'https://example.com/lp',
			campaign: 'spring',
			source: 'google',
			medium: 'cpc'
		});
		expect(url).toContain('utm_campaign=spring');
		expect(url).toContain('utm_source=google');
	});

	it('splits 3:2:2 and 60-30-10', () => {
		expect(split322(700)).toEqual({ a: 300, b: 200, c: 200 });
		expect(split603010(1000)).toEqual({ prospecting: 600, remarketing: 300, testing: 100 });
	});
});
