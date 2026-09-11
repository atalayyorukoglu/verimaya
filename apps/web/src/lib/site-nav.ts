import type { MessageKey } from '$lib/i18n/messages';

/**
 * Halka açık sitenin üst menüsü — TEK kaynak.
 *
 * Daha önce bu dizi hem `HubHomeV4.svelte` hem `ProductPillarPage.svelte`
 * içinde ayrı ayrı duruyordu; menü değişince biri güncellenip diğeri unutuluyordu.
 */
export type SiteNavItem = { href: string; labelKey: MessageKey };

export const siteNavItems: readonly SiteNavItem[] = [
	{ href: '/case-study/', labelKey: 'hub.nav.case' },
	{ href: '/tools/', labelKey: 'hub.nav.tools' },
	{ href: '/guides/', labelKey: 'hub.nav.guides' }
] as const;
