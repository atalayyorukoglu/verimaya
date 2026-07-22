/** Real API origin (NestJS). Overridden via PUBLIC_API_URL. */
export const PUBLIC_API_URL = import.meta.env.PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * When true, MSW intercepts /v1/* in dev — useful for demoing without a running API.
 * Default is false (real API at PUBLIC_API_URL). Set PUBLIC_USE_MSW=true to enable the mock demo.
 */
export const USE_MSW = (import.meta.env.PUBLIC_USE_MSW ?? 'false') === 'true';
