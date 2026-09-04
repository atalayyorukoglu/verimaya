/**
 * GAP-28 follow-up — platform admin panel gate.
 *
 * Prod: `me.platform_admin` (server allowlist).
 * Local MSW demo: also `USE_MSW ∧ DEV` so the old demo panel still works without Coolify env.
 */

export const DEV_PANEL_HREF = '/dev';

export function isDevPanelEnabled(useMsw: boolean, isDev: boolean): boolean {
	return useMsw && isDev;
}

/** Show /dev nav + page when platform admin **or** local MSW demo. */
export function canAccessPlatformPanel(platformAdmin: boolean, mswDevEnabled: boolean): boolean {
	return platformAdmin || mswDevEnabled;
}

export function isDevPanelPath(pathname: string): boolean {
	return pathname === DEV_PANEL_HREF || pathname.startsWith(`${DEV_PANEL_HREF}/`);
}

export function filterDevPanelNavItems<T extends { href: string }>(
	items: T[],
	enabled: boolean
): T[] {
	if (enabled) return items;
	return items.filter((item) => !isDevPanelPath(item.href));
}

export function resolveDevPanelRoute(
	enabled: boolean
): { action: 'allow' } | { action: 'redirect'; to: '/contacts' } {
	if (enabled) return { action: 'allow' };
	return { action: 'redirect', to: '/contacts' };
}
