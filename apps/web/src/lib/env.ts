import { env } from '$env/dynamic/public';

/** Real API origin (NestJS). Overridden via PUBLIC_API_URL. */
export const PUBLIC_API_URL = env.PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Absolute marketing site origin for canonical / Open Graph URLs (no trailing slash).
 * Production: https://verimaya.com — override via PUBLIC_SITE_URL.
 */
export const PUBLIC_SITE_URL = (env.PUBLIC_SITE_URL ?? 'https://verimaya.com').replace(/\/$/, '');

/** Panel / app origin (login + AppShell). Production: https://app.verimaya.com */
export const PUBLIC_APP_URL = (env.PUBLIC_APP_URL ?? 'https://app.verimaya.com').replace(/\/$/, '');

/** External GHL white-label CRM. Production: https://crm.verimaya.com */
export const PUBLIC_CRM_URL = (env.PUBLIC_CRM_URL ?? 'https://crm.verimaya.com').replace(/\/$/, '');

/**
 * When true, MSW intercepts /v1/* in dev — useful for demoing without a running API.
 * Default is false (real API at PUBLIC_API_URL). Set PUBLIC_USE_MSW=true to enable the mock demo.
 * Auth gate is skipped while MSW is active so the local demo stays open.
 */
export const USE_MSW = (env.PUBLIC_USE_MSW ?? 'false') === 'true';

/**
 * Free scorecard funnel telemetry (`/v1/public/karne/*`).
 * Explicit true/false overrides; otherwise off in dev, on in production.
 */
export const KARNE_TELEMETRY_ENABLED = (() => {
	const flag = env.PUBLIC_KARNE_TELEMETRY;
	if (flag === 'false') return false;
	if (flag === 'true') return true;
	return import.meta.env.PROD;
})();

/**
 * Karne email / lead capture. Fail-closed until KVKK/legal approval:
 * only `PUBLIC_KARNE_LEADS_ENABLED=true` turns the form and POST /leads on.
 */
export const KARNE_LEADS_ENABLED = (env.PUBLIC_KARNE_LEADS_ENABLED ?? 'false') === 'true';
