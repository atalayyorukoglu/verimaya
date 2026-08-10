import { describe, expect, it } from 'vitest';
import {
	assertFieldWriteAllowed,
	pickOwnedFields,
	GHL_CONTACT_FIELD_OWNERSHIP
} from './ghl.field-ownership';

describe('GHL field ownership (Adım 42)', () => {
	it('documents lead-ish fields as GHL-owned and notes as Verimaya', () => {
		expect(GHL_CONTACT_FIELD_OWNERSHIP.fullName).toBe('ghl');
		expect(GHL_CONTACT_FIELD_OWNERSHIP.status).toBe('ghl');
		expect(GHL_CONTACT_FIELD_OWNERSHIP.notes).toBe('verimaya');
	});

	it('rejects GHL writing notes', () => {
		expect(() => assertFieldWriteAllowed('contact', 'notes', 'ghl')).toThrow(
			/owned by verimaya/
		);
	});

	it('rejects Verimaya writing phone via GHL sync helper', () => {
		expect(() => assertFieldWriteAllowed('contact', 'phone', 'verimaya')).toThrow(
			/owned by ghl/
		);
	});

	it('pickOwnedFields strips notes from GHL inbound patch', () => {
		const picked = pickOwnedFields(
			{
				fullName: 'Ada',
				phone: '+1',
				email: 'a@b.c',
				status: 'scheduled',
				notes: 'should not apply'
			},
			'ghl'
		);
		expect(picked).toEqual({
			fullName: 'Ada',
			phone: '+1',
			email: 'a@b.c',
			status: 'scheduled'
		});
		expect(picked.notes).toBeUndefined();
	});
});
