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

/** Local apex — mirrors production `verimaya.com`. */
function isLocalMarketingHost(h: string): boolean {
	return h === 'localhost' || h === '127.0.0.1';
}

/** Local panel — mirrors production `app.verimaya.com` (`*.localhost` → 127.0.0.1). */
function isLocalAppHost(h: string): boolean {
	return h === 'app.localhost';
}

/** Apex / www — pazarlama hub’ı (App + CRM CTA). Local: `localhost`. */
export function isMarketingHost(hostname = browser ? window.location.hostname : ''): boolean {
	const h = hostname.toLowerCase();
	if (!h) return false;
	if (isLocalAppHost(h)) return false;
	if (isLocalMarketingHost(h)) return true;
	return MARKETING_HOSTS.has(h);
}

/** app.* — panel + login. Local: `app.localhost`. */
export function isAppHost(hostname = browser ? window.location.hostname : ''): boolean {
	const h = hostname.toLowerCase();
	if (!h) return false;
	if (isLocalAppHost(h)) return true;
	if (isLocalMarketingHost(h)) return false;
	if (APP_HOSTS.has(h)) return true;
	return !isMarketingHost(h);
}
