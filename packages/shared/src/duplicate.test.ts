import { describe, expect, it } from 'vitest';
import {
	DUPLICATE_SCAN_ROW_CAP,
	contactDuplicateGroupsResponseSchema,
	findContactDuplicateGroups,
	nameMatchKeys,
	normNameKey
} from './duplicate.js';

type TestContact = Parameters<typeof findContactDuplicateGroups>[0][number];

const person = (id: string, display_name: string): TestContact =>
	({ id, display_name, email: null, phone: null }) as TestContact;

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

describe('nameMatchKeys', () => {
	it('kısaltılmış adı yakalar — göbek adı/soyadı eksik girilmiş kayıt', () => {
		const kisa = nameMatchKeys('Sergiu Adrian');
		const uzun = nameMatchKeys('Sergiu Adrian Craciun');
		expect(kisa.some((k) => uzun.includes(k))).toBe(true);
		expect(nameMatchKeys('Sergiu Craciun').some((k) => uzun.includes(k))).toBe(true);
	});

	it('tek kelimelik ad kısaltma anahtarı üretmez', () => {
		expect(nameMatchKeys('Ali')).toEqual(['ali']);
	});

	it('ilgisiz adlar eşleşmez', () => {
		const a = nameMatchKeys('Sergiu Adrian Craciun');
		const b = nameMatchKeys('Mehmet Ali Yılmaz');
		expect(a.some((k) => b.includes(k))).toBe(false);
	});
});

describe('findContactDuplicateGroups', () => {
	it('Sergiu Adrian ile Sergiu Adrian Craciun aynı grupta', () => {
		const groups = findContactDuplicateGroups([
			person('11111111-1111-4111-8111-111111111111', 'Sergiu Adrian'),
			person('22222222-2222-4222-8222-222222222222', 'Sergiu Adrian Craciun'),
			person('33333333-3333-4333-8333-333333333333', 'Mehmet Ali Yılmaz')
		]);
		const nameGroups = groups.filter((g) => g.match_type === 'name');
		expect(nameGroups).toHaveLength(1);
		expect(nameGroups[0]!.contacts.map((c) => c.display_name).sort()).toEqual([
			'Sergiu Adrian',
			'Sergiu Adrian Craciun'
		]);
	});

	it('aynı kişi kümesini iki kez listelemez', () => {
		const groups = findContactDuplicateGroups([
			person('11111111-1111-4111-8111-111111111111', 'Sergiu Adrian Craciun'),
			person('22222222-2222-4222-8222-222222222222', 'Sergiu Adrian Craciun')
		]);
		expect(groups.filter((g) => g.match_type === 'name')).toHaveLength(1);
	});
});
