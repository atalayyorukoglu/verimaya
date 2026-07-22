import { describe, expect, it } from 'vitest';
import { scanLandingCopy } from './scan.js';

describe('scanLandingCopy', () => {
	it('flags blocked phrases', () => {
		const result = scanLandingCopy('Tedavide kesin sonuç vaat ediyoruz');
		expect(result.ok).toBe(false);
		expect(result.hits.some((h) => h.term === 'kesin sonuç')).toBe(true);
	});

	it('passes clean copy', () => {
		const result = scanLandingCopy('Ücretsiz ön görüşme için formu doldurun.');
		expect(result.ok).toBe(true);
		expect(result.hits).toHaveLength(0);
	});
});
