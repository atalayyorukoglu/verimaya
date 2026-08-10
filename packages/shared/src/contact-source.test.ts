import { describe, expect, it } from 'vitest';
import { CONTACT_MEDIUM_PRESETS, CONTACT_SOURCE_PRESETS } from './contact.js';

describe('CONTACT_SOURCE_PRESETS / CONTACT_MEDIUM_PRESETS', () => {
	it('exports the fixed display-label sets for panel source/medium selects', () => {
		expect([...CONTACT_SOURCE_PRESETS]).toEqual([
			'Dijital Reklam',
			'Referans',
			'Organik',
			'WhatsApp',
			'Diğer'
		]);
		expect([...CONTACT_MEDIUM_PRESETS]).toEqual([
			'Meta Ads',
			'Google Ads',
			'Instagram',
			'TikTok',
			'Web Formu',
			'Telefon'
		]);
	});
});
