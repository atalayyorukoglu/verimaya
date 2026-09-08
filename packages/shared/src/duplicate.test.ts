import { describe, expect, it } from 'vitest';
import {
	DUPLICATE_SCAN_ROW_CAP,
	contactDuplicateGroupsResponseSchema,
	normNameKey
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

	it('accepts truncated true with scanned_count at cap', () => {
		const parsed = contactDuplicateGroupsResponseSchema.parse({
			items: [],
			truncated: true,
			scanned_count: DUPLICATE_SCAN_ROW_CAP
		});
		expect(parsed.truncated).toBe(true);
		expect(parsed.scanned_count).toBe(5000);
	});
});

describe('normNameKey', () => {
	it('Türkçe harfleri katlar — aksansız yazım aynı kişi sayılır', () => {
		for (const [a, b] of [
			['Mehmet Yılmaz', 'Mehmet Yilmaz'],
			['Ayşe Çınar', 'Ayse Cinar'],
			['İsmail Öz', 'Ismail Oz'],
			['Gülşen Ağa', 'Gulsen Aga']
		]) {
			expect(normNameKey(a)).toBe(normNameKey(b));
		}
	});

	it('farklı isimleri birleştirmez', () => {
		expect(normNameKey('Ali Veli')).not.toBe(normNameKey('Ayşe Veli'));
	});

	it('boşlukları sadeleştirir, çok kısa adı elemez', () => {
		expect(normNameKey('  Ali   Veli ')).toBe('ali veli');
		expect(normNameKey('a')).toBeNull();
		expect(normNameKey(null)).toBeNull();
	});
});
