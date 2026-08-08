import { describe, expect, it } from 'vitest';
import { PATIENT_SOURCE_PRESETS } from '@verimaya/shared';
import {
	initPatientSourceSelect,
	PATIENT_SOURCE_SELECT_OTHER,
	resolvePatientSource
} from './patient-source-select';

describe('patient source select mapping', () => {
	it('selecting a preset submits that exact display label', () => {
		for (const preset of PATIENT_SOURCE_PRESETS) {
			expect(resolvePatientSource(preset, '')).toBe(preset);
			expect(resolvePatientSource(preset, 'ignored custom')).toBe(preset);
		}
	});

	it('empty select submits null (source stays optional)', () => {
		expect(resolvePatientSource('', '')).toBeNull();
		expect(resolvePatientSource('   ', 'anything')).toBeNull();
	});

	it("editing source 'ghl' opens in Diğer mode with value preserved on submit", () => {
		const init = initPatientSourceSelect('ghl');
		expect(init.selectValue).toBe(PATIENT_SOURCE_SELECT_OTHER);
		expect(init.customSource).toBe('ghl');
		expect(resolvePatientSource(init.selectValue, init.customSource)).toBe('ghl');
	});

	it('null/empty stored source opens on the empty option', () => {
		expect(initPatientSourceSelect(null)).toEqual({ selectValue: '', customSource: '' });
		expect(initPatientSourceSelect('')).toEqual({ selectValue: '', customSource: '' });
		expect(initPatientSourceSelect('   ')).toEqual({ selectValue: '', customSource: '' });
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
