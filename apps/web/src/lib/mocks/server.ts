import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * `handlers.ts` registers relative paths (`/v1/appointments`, ...) so the same file
 * works unmodified with the browser worker (`browser.ts`), which resolves relative
 * paths against `location.origin`. `apps/web/vitest.config.ts` uses `environment:
 * 'node'` (no jsdom — see 1.2's Görüş), so there is no `location` global for MSW to
 * resolve those relative paths against; without this, every request MSW receives is
 * reported as "unmatched" and passed through to the real network instead. This is a
 * Node-only polyfill, not a browser behavior change.
 */
if (typeof globalThis.location === 'undefined') {
	// @ts-expect-error minimal stand-in — only `origin`/`href` are used for path resolution.
	globalThis.location = new URL('http://localhost/');
}

/**
 * Node-side MSW server for vitest (the browser worker in `browser.ts` is separate —
 * that one needs a real Service Worker and only runs in the browser).
 */
export const server = setupServer(...handlers);
