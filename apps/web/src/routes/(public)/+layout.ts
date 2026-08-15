/** Public marketing surface — prerendered for SEO. Panel stays SPA (root layout). */
export const ssr = true;
export const prerender = true;
/** Directory-style output: build/vitrin/index.html (not vitrin.html). */
export const trailingSlash = 'always';

/** Root auth gate uses this marker; every route in `(public)` inherits it automatically. */
export function load() {
	return { publicRoute: true as const };
}
