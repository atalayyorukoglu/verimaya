import { describe, expect, it } from 'vitest';
import { buildContactListCursorPage } from './list-query';
import { decodeContactListCursor, encodeContactListCursor } from './pagination';

describe('contact list cursor', () => {
	it('round-trips null last name (institution rows)', () => {
		const encoded = encodeContactListCursor(null, 'Grand Blue Clinic', 'id-1');
		expect(decodeContactListCursor(encoded)).toEqual({
			lastName: null,
			firstName: 'Grand Blue Clinic',
			id: 'id-1'
		});
	});

	it('round-trips names that contain |', () => {
		const encoded = encodeContactListCursor('Ali|Kaya', 'Mehmet', 'id-2');
		expect(decodeContactListCursor(encoded)).toEqual({
			lastName: 'Ali|Kaya',
			firstName: 'Mehmet',
			id: 'id-2'
		});
	});

	it('buildContactListCursorPage emits a cursor only when more rows exist', () => {
		const rows = [
			{ id: 'a', sort_last_name: 'Aydin', sort_first_name: 'Ali' },
			{ id: 'b', sort_last_name: 'Aydin', sort_first_name: 'Zeynep' },
			{ id: 'c', sort_last_name: null, sort_first_name: 'Klinik' }
		];
		const page = buildContactListCursorPage(rows, 2);
		expect(page.items.map((r) => r.id)).toEqual(['a', 'b']);
		expect(decodeContactListCursor(page.next_cursor!)).toEqual({
			lastName: 'Aydin',
			firstName: 'Zeynep',
			id: 'b'
		});
		const last = buildContactListCursorPage(rows.slice(2), 2);
		expect(last.items.map((r) => r.id)).toEqual(['c']);
		expect(last.next_cursor).toBeNull();
	});
});
