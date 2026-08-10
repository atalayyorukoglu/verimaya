import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import Calendar from '@lucide/svelte/icons/calendar';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Wrench from '@lucide/svelte/icons/wrench';
import Library from '@lucide/svelte/icons/library';
import Settings from '@lucide/svelte/icons/settings';
import UserCog from '@lucide/svelte/icons/user-cog';
import Sparkles from '@lucide/svelte/icons/sparkles';

import type { MessageKey } from '$lib/i18n/messages';

/**
 * Rota İngilizce, etiket katalogdan gelir.
 * `labelKey` bilinçli olarak string değil — yanlış anahtar derleme hatası verir.
 * Kural: docs/TASARIM.md § Dil ve slug.
 *
 * Sidebar IA (düz):
 *   Panel (grup dışı)
 *   Kayıtlar → Kişiler, Randevular, Finans, Raporlar
 *   Büyüme → Araçlar, Kaynaklar  (hub sayfaları; alt ürünler kartlardan)
 *   Sistem → Özellikler, Ayarlar, Geliştirici
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

/** Standalone entry — rendered above groups in the sidebar. */
export const panelNavItem: NavItem = {
	labelKey: 'nav.dashboard',
	href: '/',
	icon: LayoutDashboard
};

/** Panel nav — CF dashboard grupları, TickPort renkleri; docs/TASARIM.md */
export const navGroups: NavGroup[] = [
	{
		labelKey: 'nav.group.records',
		items: [
			{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
			{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
			{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
			{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
		]
	},
	{
		labelKey: 'nav.group.growth',
		items: [
			{ labelKey: 'nav.tools', href: '/toolkit', icon: Wrench },
			{ labelKey: 'nav.resources', href: '/knowledge', icon: Library }
		]
	},
	{
		labelKey: 'nav.group.system',
		items: [
			{ labelKey: 'nav.features', href: '/features', icon: Sparkles },
			{ labelKey: 'nav.settings', href: '/settings', icon: Settings },
			{ labelKey: 'nav.developer', href: '/dev', icon: UserCog }
		]
	}
];

/** Flatten links in a group (kept for AppShell helpers). */
export function navGroupItems(group: NavGroup): NavItem[] {
	return group.items;
}

/** Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar */
export const mobileTabItems: NavItem[] = [
	panelNavItem,
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet }
];
