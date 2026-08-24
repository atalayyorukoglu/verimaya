import { describe, expect, it } from 'vitest';
import { changelog, featureFirstReleaseDate, isFeatureNew } from './changelog.js';

describe('changelog verisi', () => {
	it('kayıtlar yeniden eskiye sıralı', () => {
		const dates = changelog.map((e) => e.date);
		const sorted = [...dates].sort().reverse();
		expect(dates).toEqual(sorted);
	});

	it('her kaydın en az bir değişikliği var', () => {
		for (const entry of changelog) {
			expect(entry.changes.length).toBeGreaterThan(0);
		}
	});
});

describe('featureFirstReleaseDate / isFeatureNew (Araçlar "Yeni" rozeti)', () => {
	it("özelliğin changelog'a ilk girdiği tarihi verir", () => {
		// referral-value 0.11.0 / 2026-08-23 kaydında geçiyor.
		expect(featureFirstReleaseDate('referral-value')).toBe('2026-08-23');
	});

	it("changelog'da hiç geçmeyen özellik için null döner", () => {
		expect(featureFirstReleaseDate('boyle-bir-ozellik-yok')).toBeNull();
	});

	it('pencere içinde yeni, sonrasında değil', () => {
		expect(isFeatureNew('referral-value', '2026-08-30')).toBe(true);
		expect(isFeatureNew('referral-value', '2026-09-10')).toBe(false);
	});

	it('yayın tarihi gelecekteyse yeni saymaz (saat dilimi kayması)', () => {
		expect(isFeatureNew('referral-value', '2026-08-01')).toBe(false);
	});

	it('aynı özellik birden çok kayıtta geçerse EN ESKİ tarih alınır', () => {
		// "Yeni" rozeti ilk yayına göre olmalı; sonraki bir düzeltme kaydı
		// özelliği yeniden "yeni" göstermemeli.
		const id = 'ai-knowledge-base';
		const all = changelog
			.filter((e) => e.changes.some((c) => c.featureId === id))
			.map((e) => e.date)
			.sort();
		if (all.length > 1) {
			expect(featureFirstReleaseDate(id)).toBe(all[0]);
		} else {
			expect(featureFirstReleaseDate(id)).toBe(all[0] ?? null);
		}
	});
});
