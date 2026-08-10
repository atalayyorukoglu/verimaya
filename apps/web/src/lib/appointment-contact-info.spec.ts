import { describe, expect, it } from 'vitest';
import {
	contactInfoBlocksSave,
	contactInfoMissingKind,
	contactInfoWarningMessageKey
} from './appointment-contact-info';

describe('GAP-29 appointment contact info warning', () => {
	it('shows both-missing when phone and email are blank', () => {
		expect(contactInfoMissingKind({ phone: null, email: null })).toBe('both');
		expect(contactInfoMissingKind({ phone: '', email: '   ' })).toBe('both');
		expect(contactInfoWarningMessageKey('both')).toBe('appointments.form.contactInfoMissingBoth');
	});

	it('shows phone-only when email is present', () => {
		expect(contactInfoMissingKind({ phone: null, email: 'a@b.co' })).toBe('phone');
		expect(contactInfoMissingKind({ phone: '  ', email: 'a@b.co' })).toBe('phone');
		expect(contactInfoWarningMessageKey('phone')).toBe('appointments.form.contactInfoMissingPhone');
	});

	it('shows email-only when phone is present', () => {
		expect(contactInfoMissingKind({ phone: '+905551112233', email: null })).toBe('email');
		expect(contactInfoMissingKind({ phone: '+905551112233', email: '' })).toBe('email');
		expect(contactInfoWarningMessageKey('email')).toBe('appointments.form.contactInfoMissingEmail');
	});

	it('hides warning when phone and email are both present', () => {
		expect(contactInfoMissingKind({ phone: '+905551112233', email: 'a@b.co' })).toBeNull();
		expect(contactInfoWarningMessageKey(null)).toBeNull();
	});

	it('hides warning when no contact is selected', () => {
		expect(contactInfoMissingKind(null)).toBeNull();
		expect(contactInfoMissingKind(undefined)).toBeNull();
	});

	it('advisory helper never reports a save block', () => {
		expect(contactInfoMissingKind({ phone: null, email: null })).toBe('both');
		expect(contactInfoBlocksSave()).toBe(false);
	});
});
