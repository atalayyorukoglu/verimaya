import { describe, expect, it } from 'vitest';
import { helpContent, type HelpTopic } from './help-content';
import { messages } from './i18n/messages';

/**
 * Yardım içeriği iki yerde yaşıyor: kayıt (`help-content.ts`) ve metin (`messages.ts`).
 * Biri diğerinden kayarsa panelde anahtar adı ya da boşluk görünür — kullanıcı "ⓘ"ye
 * basınca hiçbir şey öğrenmez. Bu test o kaymayı derlemede değil testte yakalar.
 */
describe('ekran içi yardım içeriği', () => {
	const topics = Object.keys(helpContent) as HelpTopic[];
	const locales = Object.keys(messages) as Array<keyof typeof messages>;

	it('her konunun başlık, gövde ve örnek anahtarı her dilde dolu', () => {
		for (const topic of topics) {
			const content = helpContent[topic];
			const keys = [content.titleKey, ...content.bodyKeys, content.exampleKey];
			if (content.caveatKey) keys.push(content.caveatKey);

			for (const locale of locales) {
				for (const key of keys) {
					const text = messages[locale][key];
					expect(text, `${locale} · ${topic} · ${key}`).toBeTruthy();
					expect(String(text).trim().length, `${locale} · ${topic} · ${key}`).toBeGreaterThan(0);
				}
			}
		}
	});

	it('her konuda en az bir gövde paragrafı ve tek bir örnek var', () => {
		for (const topic of topics) {
			expect(helpContent[topic].bodyKeys.length, topic).toBeGreaterThan(0);
			expect(helpContent[topic].exampleKey, topic).toBeTruthy();
		}
	});

	it('ortak yardım metinleri her dilde var', () => {
		for (const locale of locales) {
			expect(messages[locale]['help.open']).toBeTruthy();
			expect(messages[locale]['help.exampleLabel']).toBeTruthy();
		}
	});
});
