import { describe, expect, it } from 'vitest';
import {
	detectGhlEventKind,
	extractGhlContactFields,
	extractGhlExternalId,
	ghlContactNotesMarker
} from './ghl.mapper';

describe('ghl.mapper', () => {
	it('detects contact from type + nested contact', () => {
		const payload = {
			type: 'ContactCreate',
			contact: {
				id: 'c_100',
				firstName: 'Ayşe',
				lastName: 'Yılmaz',
				phone: '+905551112233',
				email: 'ayse@example.com'
			}
		};
		expect(detectGhlEventKind(payload)).toBe('contact');
		expect(extractGhlExternalId(payload, 'contact')).toBe('c_100');
		expect(extractGhlContactFields(payload)).toEqual({
			externalId: 'c_100',
			firstName: 'Ayşe',
			lastName: 'Yılmaz',
			fullName: 'Ayşe Yılmaz',
			phone: '+905551112233',
			email: 'ayse@example.com'
		});
	});

	it('keeps multi-word firstName and prefers separate fields over lowercased combined', () => {
		const payload = {
			type: 'ContactCreate',
			contact: {
				id: 'c_live',
				firstName: 'Ancuta Monica',
				lastName: 'Naste-0',
				fullName: 'ancuta monica naste-0',
				name: 'ancuta monica naste-0'
			}
		};
		expect(extractGhlContactFields(payload)).toEqual({
			externalId: 'c_live',
			firstName: 'Ancuta Monica',
			lastName: 'Naste-0',
			fullName: 'Ancuta Monica Naste-0',
			phone: null,
			email: null
		});
	});

	it('falls back to combined fullName when first/last absent', () => {
		const payload = {
			type: 'ContactCreate',
			contact: {
				id: 'c_combined',
				fullName: 'John Doe'
			}
		};
		expect(extractGhlContactFields(payload)).toEqual({
			externalId: 'c_combined',
			firstName: null,
			lastName: null,
			fullName: 'John Doe',
			phone: null,
			email: null
		});
	});

	it('detects opportunity and reads nested contact fields', () => {
		const payload = {
			type: 'OpportunityUpdate',
			opportunity: {
				id: 'opp_9',
				contact: {
					id: 'c_200',
					fullName: 'John Doe',
					email: 'john@example.com'
				}
			}
		};
		expect(detectGhlEventKind(payload)).toBe('opportunity');
		expect(extractGhlExternalId(payload, 'opportunity')).toBe('opp_9');
		expect(extractGhlContactFields(payload).fullName).toBe('John Doe');
		expect(extractGhlContactFields(payload).externalId).toBe('c_200');
	});

	it('builds stable notes marker', () => {
		expect(ghlContactNotesMarker('c_100')).toBe('ghl_contact_id=c_100');
	});
});
