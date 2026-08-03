import { KARNE_LEADS_ENABLED } from '$lib/env';
import type { EmailGatePosition } from './gate';

export type { EmailGatePosition };

/**
 * Free scorecard UX toggles (A/B-ready).
 * Change EMAIL_GATE_POSITION to swap gate placement without rewriting the page.
 */

/** Default: ask for email after the result is shown. */
export const EMAIL_GATE_POSITION: EmailGatePosition = 'after-result';

/** Re-export fail-closed lead gate (LEG-01). */
export { KARNE_LEADS_ENABLED };
