/**
 * GAP-28 — MSW-only developer panel gate.
 *
 * Free of `$env` / `$app` imports so Vitest (`environment: 'node'`) can cover
 * the flag + nav + route decisions without mocking SvelteKit virtual modules.
 * Callers feed already-resolved `USE_MSW` and `import.meta.env.DEV`
 * (same AND as MSW boot in `+layout.svelte`).
 */

/** MSW-only developer panel route (no Nest `/v1/dev/*` module). */
export const DEV_PANEL_HREF = '/dev';

/**
 * Whether the developer panel may appear in the nav and serve its UI.
 *
 * Gate = `PUBLIC_USE_MSW` AND Vite DEV. Rationale:
 * - The `/v1/dev/*` handlers exist only in MSW; Nest has no matching module.
 * - `USE_MSW` alone would still surface a broken empty screen under
 *   `vite dev` against the real API (`PUBLIC_USE_MSW=false`).
 * - `DEV` alone is wrong: the panel is mock-demo tooling, not "any local build".
 * - Production Docker bakes `PUBLIC_USE_MSW=false`; combining with `DEV` is
 *   belt-and-suspenders if that ever slips.
 *
 * **Single definition of the AND** — do not re-derive `useMsw && isDev` at call sites;
 * pass the booleans into this function (or reuse a local `const enabled = isDevPanelEnabled(...)`).
 */
export function isDevPanelEnabled(useMsw: boolean, isDev: boolean): boolean {
	return useMsw && isDev;
}

export function isDevPanelPath(pathname: string): boolean {
	return pathname === DEV_PANEL_HREF || pathname.startsWith(`${DEV_PANEL_HREF}/`);
}

/** Drop the Geliştirici nav item when the panel is gated off. */
export function filterDevPanelNavItems<T extends { href: string }>(
	items: T[],
	enabled: boolean
): T[] {
	if (enabled) return items;
	return items.filter((item) => !isDevPanelPath(item.href));
}

/**
 * Route gate: allow the page, or send the user to the panel home.
 * Used by `/dev` and covered by unit tests (SPA has no server redirect).
 */
export function resolveDevPanelRoute(
	enabled: boolean
): { action: 'allow' } | { action: 'redirect'; to: '/' } {
	if (enabled) return { action: 'allow' };
	return { action: 'redirect', to: '/' };
}
