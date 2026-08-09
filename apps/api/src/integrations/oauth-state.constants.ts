/**
 * OAuth state TTL (Ads + GHL).
 *
 * Not 60s: real authorize flows include account picker, consent, and often login/2FA —
 * those routinely exceed one minute and would surface as oauth_state_expired.
 * Security win is one-time-use (jti + Redis), not a one-minute window; 10m → 5m halves
 * the replay window without breaking the happy path.
 */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
