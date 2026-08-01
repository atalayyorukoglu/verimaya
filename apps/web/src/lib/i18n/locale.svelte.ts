/**
 * Aktif dil ve çeviri erişimi.
 *
 * `.svelte.ts` uzantısı zorunlu — modül düzeyinde `$state` kullanıyor (Svelte 5 runes).
 * Reaktifliğin modül sınırını geçmesi için değer doğrudan export edilmez, getter ile okunur.
 *
 * Kullanım (uzantı `.svelte` olarak yazılır, `.ts` yazılmaz):
 *   import { t } from '$lib/i18n/locale.svelte';
 *   <span>{t('nav.patients')}</span>
 *
 * Panel rotaları dile göre çoğaltılmaz — `/patients` vardır, `/tr/hastalar` yoktur.
 * Dil kullanıcı tercihidir, URL'in parçası değildir. Gerekçe: docs/TASARIM.md § Dil ve slug.
 */

import { defaultLocale, messages, type Locale, type MessageKey } from './messages';

let currentLocale = $state<Locale>(defaultLocale);

/** Aktif dili okur. Bileşen içinde çağrıldığında reaktiftir. */
export function getLocale(): Locale {
	return currentLocale;
}

/**
 * Aktif dili değiştirir.
 * Kalıcılık (kullanıcı profili / JWT claim) Faz 1'de eklenecek — şu an yalnızca oturum içi.
 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
}

/** Anahtarı aktif dile çevirir; eksikse varsayılan dile, o da yoksa anahtarın kendisine düşer. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
	const template = messages[currentLocale][key] ?? messages[defaultLocale][key] ?? key;
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}
