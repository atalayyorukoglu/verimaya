import { describe, expect, it } from 'vitest';
import {
	DUPLICATE_SCAN_ROW_CAP,
	contactDuplicateGroupsResponseSchema,
	patientDuplicateGroupsResponseSchema
} from './duplicate.js';

describe('duplicate scan response schemas', () => {
	it('exports row cap of 5000', () => {
		expect(DUPLICATE_SCAN_ROW_CAP).toBe(5000);
	});

	it('accepts items + truncated + scanned_count (contacts)', () => {
		const parsed = contactDuplicateGroupsResponseSchema.parse({
			items: [],
			truncated: false,
			scanned_count: 12
		});
		expect(parsed.truncated).toBe(false);
		expect(parsed.scanned_count).toBe(12);
	});

	it('accepts truncated true with scanned_count at cap (patients)', () => {
		const parsed = patientDuplicateGroupsResponseSchema.parse({
			items: [],
			truncated: true,
			scanned_count: DUPLICATE_SCAN_ROW_CAP
		});
		expect(parsed.truncated).toBe(true);
		expect(parsed.scanned_count).toBe(5000);
	});
});
