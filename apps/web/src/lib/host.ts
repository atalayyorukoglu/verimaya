import { browser } from '$app/environment';
import { PUBLIC_APP_URL, PUBLIC_SITE_URL } from '$lib/env';

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return '';
	}
}

const MARKETING_HOSTS = new Set(
	[hostnameOf(PUBLIC_SITE_URL), 'www.' + hostnameOf(PUBLIC_SITE_URL)].filter(Boolean)
);

const APP_HOSTS = new Set([hostnameOf(PUBLIC_APP_URL)].filter(Boolean));

/** Apex / www — pazarlama hub’ı (App + CRM CTA). */
export function isMarketingHost(hostname = browser ? window.location.hostname : ''): boolean {
	const h = hostname.toLowerCase();
	if (!h || h === 'localhost' || h === '127.0.0.1') return false;
	return MARKETING_HOSTS.has(h);
}

/** app.* — panel + login. Localhost defaults to app. */
export function isAppHost(hostname = browser ? window.location.hostname : ''): boolean {
	const h = hostname.toLowerCase();
	if (!h || h === 'localhost' || h === '127.0.0.1') return true;
	if (APP_HOSTS.has(h)) return true;
	return !isMarketingHost(h);
}
