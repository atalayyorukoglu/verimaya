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

import type { MessageKey } from '$lib/i18n/messages';

/**
 * Rota İngilizce, etiket katalogdan gelir.
 * `labelKey` bilinçli olarak string değil — yanlış anahtar derleme hatası verir.
 * Kural: docs/TASARIM.md § Dil ve slug.
 *
 * Sidebar IA:
 *   Ürünler → Kişiler, Randevular, Finans, Raporlar
 *   Araçlar → /toolkit’ten açılan modüller (Temassız, Kohort, …)
 *   Kaynaklar → Maya Ai + Rehberler (/knowledge)
 *   Sistem → Araçlar kataloğu, Ayarlar, Platform
 *   Yenilikler hesap menüsünde (Destek üstü).
 *
 * Login / erişim reddi iniş: `/contacts` (Panel ana sayfası kaldırıldı, 2026-09-04).
 */
export type NavItem = {
	labelKey: MessageKey;
	href: string;
	icon: Component;
};

export type NavGroup = {
	/** Omit only if a group must stay untitled (prefer labeled groups). */
	labelKey?: MessageKey;
	items: NavItem[];
};

/** @deprecated Standalone Maya kaldırıldı; Kaynaklar grubunda. */
export const mayaNavItem: NavItem = {
	labelKey: 'nav.maya',
	href: '/maya',
	icon: Bot
};

/** Fixed Ürünler entries (toggleable tools live in the Araçlar group). */
export const coreProductNavItems: NavItem[] = [
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
	{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
];

/** Kaynaklar grubu: Maya + Rehberler. */
export const secondaryProductNavItems: NavItem[] = [
	mayaNavItem,
	{ labelKey: 'nav.guides', href: '/knowledge', icon: Library }
];

const systemNavItems: NavItem[] = [
	{ labelKey: 'nav.tools', href: '/toolkit', icon: Wrench },
	{ labelKey: 'nav.settings', href: '/settings', icon: Settings },
	{ labelKey: 'nav.developer', href: '/dev', icon: UserCog }
];

/**
 * Builds sidebar groups. Araçlar is reactive: pass enabled modules from
 * `$lib/product-modules.svelte`.
 */
export function buildNavGroups(enabledToolModules: NavItem[]): NavGroup[] {
	const groups: NavGroup[] = [
		{
			labelKey: 'nav.group.products',
			items: [...coreProductNavItems]
		}
	];
	if (enabledToolModules.length > 0) {
		groups.push({
			labelKey: 'nav.group.tools',
			items: enabledToolModules
		});
	}
	groups.push({
		labelKey: 'nav.group.resources',
		items: [...secondaryProductNavItems]
	});
	groups.push({
		labelKey: 'nav.group.system',
		items: systemNavItems
	});
	return groups;
}

/** Flatten links in a group (kept for AppShell helpers). */
export function navGroupItems(group: NavGroup): NavItem[] {
	return group.items;
}

/**
 * Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar.
 * Sıra: Finans, Kişiler, Randevular, Raporlar (+ Menü butonu AppShell’de).
 */
/** Alt menü sekmeleri; son yuva "Menü" (rota değil, AppShell'de render edilir). */
export const mobileTabItems: NavItem[] = [
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
];

/** Oturum açılışı ve yetkisiz rota yönlendirmesi. */
export const PANEL_HOME_HREF = '/contacts' as const;
