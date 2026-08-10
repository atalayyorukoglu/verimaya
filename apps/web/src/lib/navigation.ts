import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import Calendar from '@lucide/svelte/icons/calendar';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Megaphone from '@lucide/svelte/icons/megaphone';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
import Bot from '@lucide/svelte/icons/bot';
import BookOpen from '@lucide/svelte/icons/book-open';
import Settings from '@lucide/svelte/icons/settings';
import UserCog from '@lucide/svelte/icons/user-cog';
import Sparkles from '@lucide/svelte/icons/sparkles';

import type { MessageKey } from '$lib/i18n/messages';

/**
 * Rota İngilizce, etiket katalogdan gelir.
 * `labelKey` bilinçli olarak string değil — yanlış anahtar derleme hatası verir.
 * Kural: docs/TASARIM.md § Dil ve slug.
 */
export type NavItem = {
	labelKey: MessageKey;
	href: string;
	icon: Component;
};

export type NavSubgroup = {
	labelKey: MessageKey;
	items: NavItem[];
};

export type NavGroup = {
	labelKey: MessageKey;
	/** Flat links under the group (Kayıtlar, Sistem). */
	items?: NavItem[];
	/** Nested labelled buckets (Büyüme → Araçlar / Kaynaklar). */
	subgroups?: NavSubgroup[];
};

/** Flatten all actionable links in a group (items or nested subgroup items). */
export function navGroupItems(group: NavGroup): NavItem[] {
	if (group.subgroups?.length) {
		return group.subgroups.flatMap((s) => s.items);
	}
	return group.items ?? [];
}

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
		subgroups: [
			{
				labelKey: 'nav.group.tools',
				items: [
					{ labelKey: 'nav.scorecard', href: '/scorecard', icon: ClipboardCheck },
					{ labelKey: 'nav.marketingOverview', href: '/marketing', icon: Megaphone }
				]
			},
			{
				labelKey: 'nav.group.resources',
				items: [
					{ labelKey: 'nav.aiPrep', href: '/resources/ai-prep', icon: Bot },
					{ labelKey: 'nav.docs', href: '/resources/docs', icon: BookOpen }
				]
			}
		]
	},
	{
		labelKey: 'nav.group.system',
		items: [
			{ labelKey: 'nav.settings', href: '/settings', icon: Settings },
			{ labelKey: 'nav.features', href: '/features', icon: Sparkles },
			{ labelKey: 'nav.developer', href: '/dev', icon: UserCog }
		]
	}
];

/** Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar */
export const mobileTabItems: NavItem[] = [
	panelNavItem,
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet }
];
