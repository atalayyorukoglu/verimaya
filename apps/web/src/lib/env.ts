/** Real API origin (NestJS). Overridden via PUBLIC_API_URL. */
export const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Absolute site origin for canonical / Open Graph URLs (no trailing slash).
 * Production default matches sitemap/robots; override via PUBLIC_SITE_URL.
 */
export const PUBLIC_SITE_URL = (
	import.meta.env.PUBLIC_SITE_URL ?? 'https://verimaya.app'
).replace(/\/$/, '');

/**
 * When true, MSW intercepts /v1/* in dev — useful for demoing without a running API.
 * Default is false (real API at PUBLIC_API_URL). Set PUBLIC_USE_MSW=true to enable the mock demo.
 */
export const USE_MSW = (import.meta.env.PUBLIC_USE_MSW ?? 'false') === 'true';

/**
 * Free scorecard funnel telemetry (`/v1/public/karne/*`).
 * Explicit true/false overrides; otherwise off in dev, on in production.
 */
export const KARNE_TELEMETRY_ENABLED = (() => {
	const flag = import.meta.env.PUBLIC_KARNE_TELEMETRY;
	if (flag === 'false') return false;
	if (flag === 'true') return true;
	return import.meta.env.PROD;
})();
