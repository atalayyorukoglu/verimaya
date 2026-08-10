import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import Calendar from '@lucide/svelte/icons/calendar';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Megaphone from '@lucide/svelte/icons/megaphone';
import Calculator from '@lucide/svelte/icons/calculator';
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import LayoutTemplate from '@lucide/svelte/icons/layout-template';
import Gauge from '@lucide/svelte/icons/gauge';
import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
import Bot from '@lucide/svelte/icons/bot';
import Settings from '@lucide/svelte/icons/settings';
import UserCog from '@lucide/svelte/icons/user-cog';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Bell from '@lucide/svelte/icons/bell';

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

export type NavGroup = {
	labelKey: MessageKey;
	items: NavItem[];
};

/** Panel nav — CF dashboard grupları, TickPort renkleri; docs/TASARIM.md */
export const navGroups: NavGroup[] = [
	{
		labelKey: 'nav.group.records',
		items: [
			{ labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
			{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
			{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
			{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet },
			{ labelKey: 'nav.reports', href: '/reports', icon: ChartColumn }
		]
	},
	{
		labelKey: 'nav.group.tools',
		items: [
			{ labelKey: 'nav.scorecard', href: '/scorecard', icon: ClipboardCheck },
			{ labelKey: 'nav.marketingOverview', href: '/marketing', icon: Megaphone },
			{ labelKey: 'nav.calculator', href: '/marketing/calculator', icon: Calculator },
			{ labelKey: 'nav.simulator', href: '/marketing/simulator', icon: FlaskConical },
			{ labelKey: 'nav.compliance', href: '/marketing/compliance', icon: ShieldCheck },
			{ labelKey: 'nav.templates', href: '/marketing/templates', icon: LayoutTemplate },
			{ labelKey: 'nav.measurement', href: '/marketing/measurement', icon: Gauge },
			{ labelKey: 'nav.preLaunch', href: '/marketing/pre-launch', icon: ClipboardCheck }
		]
	},
	{
		labelKey: 'nav.group.resources',
		items: [{ labelKey: 'nav.aiPrep', href: '/resources/ai-prep', icon: Bot }]
	},
	{
		labelKey: 'nav.group.system',
		items: [
			{ labelKey: 'nav.settings', href: '/settings', icon: Settings },
			{ labelKey: 'nav.features', href: '/features', icon: Sparkles },
			{ labelKey: 'nav.changelog', href: '/changelog', icon: Bell },
			{ labelKey: 'nav.developer', href: '/dev', icon: UserCog }
		]
	}
];

/** Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar */
export const mobileTabItems: NavItem[] = [
	{ labelKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
	{ labelKey: 'nav.contacts', href: '/contacts', icon: Users },
	{ labelKey: 'nav.appointments', href: '/appointments', icon: Calendar },
	{ labelKey: 'nav.transactions', href: '/finance', icon: Wallet }
];
