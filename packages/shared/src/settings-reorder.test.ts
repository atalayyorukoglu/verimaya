import { describe, expect, it } from 'vitest';
import { SETTINGS_REORDER_MAX_ITEMS, settingsReorderSchema } from './settings-reorder.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('settingsReorderSchema (GAP-27)', () => {
	it('accepts absolute id/sort_order pairs within the bulk-type max', () => {
		expect(
			settingsReorderSchema.safeParse({
				items: [{ id, sort_order: 0 }]
			}).success
		).toBe(true);
	});

	it('rejects empty items, unknown keys, and duplicate ids', () => {
		expect(settingsReorderSchema.safeParse({ items: [] }).success).toBe(false);
		expect(
			settingsReorderSchema.safeParse({
				items: [{ id, sort_order: 0 }],
				extra: true
			}).success
		).toBe(false);
		expect(
			settingsReorderSchema.safeParse({
				items: [
					{ id, sort_order: 0 },
					{ id, sort_order: 1 }
				]
			}).success
		).toBe(false);
	});

	it(`caps items at ${SETTINGS_REORDER_MAX_ITEMS}`, () => {
		const items = Array.from({ length: SETTINGS_REORDER_MAX_ITEMS + 1 }, (_, i) => ({
			id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
			sort_order: 0
		}));
		expect(settingsReorderSchema.safeParse({ items }).success).toBe(false);
		expect(
			settingsReorderSchema.safeParse({
				items: [
					{ id, sort_order: 0 },
					{ id: id2, sort_order: 1 }
				]
			}).success
		).toBe(true);
	});
});
