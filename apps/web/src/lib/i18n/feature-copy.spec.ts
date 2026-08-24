import { describe, expect, it } from 'vitest';
import { features } from '@verimaya/shared';
import { messages } from './messages';

/**
 * Araçlar sayfası her özellik için `toolkit.feature.<id>.title` ve `.description`
 * anahtarlarını okur; bulamazsa **sessizce** `fallback` anahtarına düşer ve kartta
 * "Özellik / Açıklama yakında." yazar.
 *
 * 2026-08-24'te tam bu oldu: 12 yeni özellik `features.ts`'e eklendi, metin anahtarları
 * unutuldu, canlıda 12 kart "Özellik" diye göründü. Tip sistemi yakalayamadı çünkü
 * yedek anahtar geçerli bir `MessageKey`.
 *
 * Bu test o boşluğu kapatır: yeni bir özellik metinsiz eklenirse **derlemede değil ama
 * testte** kırılır. Sessiz bozulma yerine gürültülü hata (YAPIM-GUNLUGU § 14.3).
 */
describe('Araçlar — her özelliğin metni var', () => {
	const locales = ['tr', 'en'] as const;

	for (const locale of locales) {
		it(`${locale}: her özellik için başlık ve açıklama tanımlı`, () => {
			const catalogue = messages[locale] as Record<string, string>;
			const missing: string[] = [];

			for (const feature of features) {
				for (const kind of ['title', 'description'] as const) {
					const key = `toolkit.feature.${feature.id}.${kind}`;
					const value = catalogue[key];
					if (!value || !value.trim()) missing.push(key);
				}
			}

			expect(missing, `eksik metin anahtarları:\n${missing.join('\n')}`).toEqual([]);
		});
	}

	it('yedek metin gerçek bir özelliğe atanmış olamaz', () => {
		const tr = messages.tr as Record<string, string>;
		for (const feature of features) {
			expect(tr[`toolkit.feature.${feature.id}.title`]).not.toBe(
				tr['toolkit.feature.fallback.title']
			);
		}
	});

	it('rotası olan özelliğin rotası panel içi mutlak yol', () => {
		for (const feature of features) {
			if (!feature.route) continue;
			expect(feature.route.startsWith('/'), `${feature.id}: ${feature.route}`).toBe(true);
		}
	});
});
