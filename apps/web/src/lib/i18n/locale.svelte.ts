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

import { defaultLocale, locales, messages, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'verimaya:locale';

function isLocale(value: string | null): value is Locale {
	return value !== null && (locales as readonly string[]).includes(value);
}

function readStoredLocale(): Locale {
	if (typeof localStorage === 'undefined') return defaultLocale;
	const raw = localStorage.getItem(STORAGE_KEY);
	return isLocale(raw) ? raw : defaultLocale;
}

function applyLocale(locale: Locale): void {
	if (typeof document !== 'undefined') {
		document.documentElement.lang = locale;
	}
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, locale);
	}
}

let currentLocale = $state<Locale>(defaultLocale);

/** Aktif dili okur. Bileşen içinde çağrıldığında reaktiftir. */
export function getLocale(): Locale {
	return currentLocale;
}

/**
 * Aktif dili değiştirir.
 * Tercih `localStorage` (`verimaya:locale`) ile saklanır; profil/JWT kalıcılığı ayrı iş.
 */
export function setLocale(locale: Locale): void {
	currentLocale = locale;
	applyLocale(locale);
}

/** Sayfa yükünde saklı dili uygular (tema init ile aynı desen). */
export function initLocale(): Locale {
	const locale = readStoredLocale();
	currentLocale = locale;
	applyLocale(locale);
	return locale;
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
