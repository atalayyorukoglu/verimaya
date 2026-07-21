/** Real API origin (NestJS). Overridden via PUBLIC_API_URL. */
export const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * When true (default in demo), MSW intercepts /v1/* in dev.
 * Set PUBLIC_USE_MSW=false to call the real API at PUBLIC_API_URL.
 */
export const USE_MSW = (import.meta.env.PUBLIC_USE_MSW ?? 'true') === 'true';
