import { describe, expect, it } from 'vitest';
import { contactListSortKeys } from './contact-list-sort.js';

describe('contactListSortKeys', () => {
	it('uses stored last_name when present', () => {
		expect(
			contactListSortKeys({
				contact_type_name: 'Hasta',
				display_name: 'Mehmet Ali Kaya',
				first_name: 'Mehmet',
				last_name: 'Ali Kaya'
			})
		).toEqual({ sortLastName: 'Ali Kaya', sortFirstName: 'Mehmet' });
	});

	it('derives surname from display_name when last_name is null', () => {
		expect(
			contactListSortKeys({
				contact_type_name: 'Hasta',
				display_name: 'Gap07 Patient B',
				first_name: 'Gap07 Patient B',
				last_name: null
			})
		).toEqual({ sortLastName: 'Patient B', sortFirstName: 'Gap07' });
	});

	it('sorts institutions by full display name', () => {
		expect(
			contactListSortKeys({
				contact_type_name: 'Klinik',
				display_name: 'Grand Blue Clinic',
				first_name: 'Grand Blue Clinic',
				last_name: null
			})
		).toEqual({ sortLastName: null, sortFirstName: 'Grand Blue Clinic' });
	});
});
