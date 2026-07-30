import { describe, expect, it } from 'vitest';
import { applyAiDisclosure } from './disclosure';

const DISCLOSURE = {
	enabled: true,
	text: 'Bu yanıt yapay zekâ desteğiyle oluşturulmuştur.'
};

describe('applyAiDisclosure', () => {
	it('ayar açık + origin=ai → gövde ifşa ile başlar', () => {
		const { body, applied } = applyAiDisclosure('Merhaba', DISCLOSURE, 'ai');
		expect(applied).toBe(true);
		expect(body.startsWith(DISCLOSURE.text)).toBe(true);
		expect(body).toContain('Merhaba');
	});

	it('ayar kapalı + origin=ai → gövde değişmez', () => {
		const { body, applied } = applyAiDisclosure(
			'Merhaba',
			{ enabled: false, text: DISCLOSURE.text },
			'ai'
		);
		expect(applied).toBe(false);
		expect(body).toBe('Merhaba');
	});

	it('origin=human → ayar açıksa bile dokunmaz', () => {
		const { body, applied } = applyAiDisclosure('İnsan yazdı', DISCLOSURE, 'human');
		expect(applied).toBe(false);
		expect(body).toBe('İnsan yazdı');
	});
});
