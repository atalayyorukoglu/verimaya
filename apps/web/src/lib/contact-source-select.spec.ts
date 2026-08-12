import { describe, expect, it } from 'vitest';
import {
	CONTACT_SOURCE_LEGACY_CATCH_ALL,
	CONTACT_SOURCE_SELECT_OTHER,
	CONTACT_SOURCE_SELECT_PRESETS,
	CONTACT_SOURCE_SELECT_UNKNOWN,
	initContactSourceSelect,
	resolveContactSource
} from './contact-source-select';

describe('contact source select mapping', () => {
	it('selecting a preset submits that exact display label', () => {
		for (const preset of CONTACT_SOURCE_SELECT_PRESETS) {
			expect(resolveContactSource(preset, '')).toBe(preset);
			expect(resolveContactSource(preset, 'ignored custom')).toBe(preset);
		}
	});

	it('legacy catch-all preset is not offered in the select list', () => {
		expect(CONTACT_SOURCE_SELECT_PRESETS).not.toContain(CONTACT_SOURCE_LEGACY_CATCH_ALL);
	});

	it('Bilinmiyor (UNKNOWN sentinel) submits null — never stored as a literal', () => {
		expect(resolveContactSource(CONTACT_SOURCE_SELECT_UNKNOWN, '')).toBeNull();
		expect(resolveContactSource(CONTACT_SOURCE_SELECT_UNKNOWN, 'ignored')).toBeNull();
	});

	it('empty select still submits null (defensive)', () => {
		expect(resolveContactSource('', '')).toBeNull();
		expect(resolveContactSource('   ', 'anything')).toBeNull();
	});

	it("editing source 'ghl' opens in Diğer mode with value preserved on submit", () => {
		const init = initContactSourceSelect('ghl');
		expect(init.selectValue).toBe(CONTACT_SOURCE_SELECT_OTHER);
		expect(init.customSource).toBe('ghl');
		expect(resolveContactSource(init.selectValue, init.customSource)).toBe('ghl');
	});

	it("legacy stored source 'Diğer' opens in Diğer mode (not a duplicate preset)", () => {
		const init = initContactSourceSelect('Diğer');
		expect(init.selectValue).toBe(CONTACT_SOURCE_SELECT_OTHER);
		expect(init.customSource).toBe('Diğer');
		expect(resolveContactSource(init.selectValue, init.customSource)).toBe('Diğer');
	});

	it('null/empty stored source opens on Bilinmiyor (UNKNOWN)', () => {
		expect(initContactSourceSelect(null)).toEqual({
			selectValue: CONTACT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
		expect(initContactSourceSelect('')).toEqual({
			selectValue: CONTACT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
		expect(initContactSourceSelect('   ')).toEqual({
			selectValue: CONTACT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
	});

	it('preset label opens on that preset option', () => {
		expect(initContactSourceSelect('Organik')).toEqual({
			selectValue: 'Organik',
			customSource: ''
		});
	});

	it('other with blank custom submits null', () => {
		expect(resolveContactSource(CONTACT_SOURCE_SELECT_OTHER, '  ')).toBeNull();
	});
});
