import { describe, expect, it } from 'vitest';
import { PATIENT_SOURCE_PRESETS } from '@verimaya/shared';
import {
	initPatientSourceSelect,
	PATIENT_SOURCE_SELECT_OTHER,
	PATIENT_SOURCE_SELECT_UNKNOWN,
	resolvePatientSource
} from './patient-source-select';

describe('patient source select mapping', () => {
	it('selecting a preset submits that exact display label', () => {
		for (const preset of PATIENT_SOURCE_PRESETS) {
			expect(resolvePatientSource(preset, '')).toBe(preset);
			expect(resolvePatientSource(preset, 'ignored custom')).toBe(preset);
		}
	});

	it('Bilinmiyor (UNKNOWN sentinel) submits null — never stored as a literal', () => {
		expect(resolvePatientSource(PATIENT_SOURCE_SELECT_UNKNOWN, '')).toBeNull();
		expect(resolvePatientSource(PATIENT_SOURCE_SELECT_UNKNOWN, 'ignored')).toBeNull();
	});

	it('empty select still submits null (defensive)', () => {
		expect(resolvePatientSource('', '')).toBeNull();
		expect(resolvePatientSource('   ', 'anything')).toBeNull();
	});

	it("editing source 'ghl' opens in Diğer mode with value preserved on submit", () => {
		const init = initPatientSourceSelect('ghl');
		expect(init.selectValue).toBe(PATIENT_SOURCE_SELECT_OTHER);
		expect(init.customSource).toBe('ghl');
		expect(resolvePatientSource(init.selectValue, init.customSource)).toBe('ghl');
	});

	it('null/empty stored source opens on Bilinmiyor (UNKNOWN)', () => {
		expect(initPatientSourceSelect(null)).toEqual({
			selectValue: PATIENT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
		expect(initPatientSourceSelect('')).toEqual({
			selectValue: PATIENT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
		expect(initPatientSourceSelect('   ')).toEqual({
			selectValue: PATIENT_SOURCE_SELECT_UNKNOWN,
			customSource: ''
		});
	});

	it('preset label opens on that preset option', () => {
		expect(initPatientSourceSelect('Meta')).toEqual({
			selectValue: 'Meta',
			customSource: ''
		});
	});

	it('other with blank custom submits null', () => {
		expect(resolvePatientSource(PATIENT_SOURCE_SELECT_OTHER, '  ')).toBeNull();
	});
});
