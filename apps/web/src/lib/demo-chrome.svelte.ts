/**
 * MSW demo bandı + araç çubuğu görünürlüğü.
 *
 * Varsayılan kapalı — tasarım/UI çalışırken ekranı örtmesin.
 * Hesap menüsünden açılır; tercih `localStorage`'da kalır.
 *
 * Kullanım (uzantı `.svelte`, `.ts` yazılmaz):
 *   import { isDemoChromeVisible, toggleDemoChrome } from '$lib/demo-chrome.svelte';
 */

const STORAGE_KEY = 'verimaya:demo-chrome';

function readStored(): boolean {
	if (typeof localStorage === 'undefined') return false;
	return localStorage.getItem(STORAGE_KEY) === '1';
}

let visible = $state(false);

/** Bileşen içinde çağrıldığında reaktiftir. */
export function isDemoChromeVisible(): boolean {
	return visible;
}

export function setDemoChromeVisible(next: boolean): void {
	visible = next;
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
	}
}

export function toggleDemoChrome(): void {
	setDemoChromeVisible(!visible);
}

/** Sayfa yükünde saklı tercihi uygular. */
export function initDemoChrome(): void {
	visible = readStored();
}
