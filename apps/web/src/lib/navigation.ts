import type { Component } from 'svelte';
import Users from '@lucide/svelte/icons/users';
import Calendar from '@lucide/svelte/icons/calendar';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Wrench from '@lucide/svelte/icons/wrench';
import Library from '@lucide/svelte/icons/library';
import Settings from '@lucide/svelte/icons/settings';
import UserCog from '@lucide/svelte/icons/user-cog';
import Bot from '@lucide/svelte/icons/bot';
import Sparkles from '@lucide/svelte/icons/sparkles';

import type { MessageKey } from '$lib/i18n/messages';

/**
 * Rota İngilizce, etiket katalogdan gelir.
 * `labelKey` bilinçli olarak string değil — yanlış anahtar derleme hatası verir.
 * Kural: docs/TASARIM.md § Dil ve slug.
 *
 * Sidebar IA:
 *   Maya AI (grup dışı)
 *   Ürünler → Kişiler, Randevular, Finans, Raporlar + açık ürün modülleri (ör. Kampanya Asistanı)
 *   Sistem → Araçlar, Kaynaklar, Yenilikler, Ayarlar, Platform (`/dev` — gated by
 *   `isDevPanelEnabled` in `$lib/dev-panel`, filtered in AppShell)
 *
 * Login / erişim reddi iniş: `/contacts` (Panel ana sayfası kaldırıldı, 2026-09-04).
 */
export type NavItem = {
	labelKey: MessageKey;
	href: string;
	icon: Component;
};

export type NavGroup = {
	labelKey: MessageKey;
	items: NavItem[];
};

/** Standalone entry — above groups in the sidebar. */
export const mayaNavItem: NavItem = {
	labelKey: 'nav.maya',
	href: '/maya',
	icon: Bot
};

/** Fixed Ürünler entries (toggleable modules appended at runtime). */
export const coreProductNavItems: NavItem[] = [
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
	{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
];

const systemNavItems: NavItem[] = [
	{ labelKey: 'nav.tools', href: '/toolkit', icon: Wrench },
	{ labelKey: 'nav.resources', href: '/knowledge', icon: Library },
	{ labelKey: 'nav.changelog', href: '/changelog', icon: Sparkles },
	{ labelKey: 'nav.settings', href: '/settings', icon: Settings },
	{ labelKey: 'nav.developer', href: '/dev', icon: UserCog }
];

/**
 * Builds sidebar groups. Ürünler is reactive: pass enabled modules from
 * `$lib/product-modules.svelte`.
 */
export function buildNavGroups(enabledProductModules: NavItem[]): NavGroup[] {
	return [
		{
			labelKey: 'nav.group.products',
			items: [...coreProductNavItems, ...enabledProductModules]
		},
		{
			labelKey: 'nav.group.system',
			items: systemNavItems
		}
	];
}

/** Flatten links in a group (kept for AppShell helpers). */
export function navGroupItems(group: NavGroup): NavItem[] {
	return group.items;
}

/**
 * Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar.
 * Sıra: Finans, Kişiler, Randevular, Raporlar (+ Menü butonu AppShell’de).
 */
export const mobileTabItems: NavItem[] = [
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
];

/** Oturum açılışı ve yetkisiz rota yönlendirmesi. */
export const PANEL_HOME_HREF = '/contacts' as const;
