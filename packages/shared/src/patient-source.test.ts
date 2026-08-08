import { describe, expect, it } from 'vitest';
import { PATIENT_SOURCE_PRESETS } from './patient.js';

describe('PATIENT_SOURCE_PRESETS', () => {
	it('exports the fixed display-label set for panel source select', () => {
		expect([...PATIENT_SOURCE_PRESETS]).toEqual([
			'Meta',
			'Google',
			'WhatsApp',
			'Tavsiye',
			'Organik'
		]);
	});
});
