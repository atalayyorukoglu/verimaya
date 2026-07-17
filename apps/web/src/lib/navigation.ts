import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import Calendar from '@lucide/svelte/icons/calendar';
import MessageCircle from '@lucide/svelte/icons/message-circle';
import Wallet from '@lucide/svelte/icons/wallet';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Link2 from '@lucide/svelte/icons/link-2';
import Megaphone from '@lucide/svelte/icons/megaphone';
import Webhook from '@lucide/svelte/icons/webhook';
import UsersRound from '@lucide/svelte/icons/users-round';
import Settings from '@lucide/svelte/icons/settings';
import ScrollText from '@lucide/svelte/icons/scroll-text';

export type NavItem = {
	label: string;
	href: string;
	icon: Component;
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

/** Cloudflare-dashboard gruplu menü — docs/TASARIM.md */
export const navGroups: NavGroup[] = [
	{
		label: 'Ana',
		items: [
			{ label: 'Panel', href: '/', icon: LayoutDashboard },
			{ label: 'Hastalar', href: '/hastalar', icon: Users },
			{ label: 'Randevular', href: '/randevular', icon: Calendar }
		]
	},
	{
		label: 'İletişim',
		items: [{ label: 'WhatsApp Inbox', href: '/inbox', icon: MessageCircle }]
	},
	{
		label: 'Finans',
		items: [
			{ label: 'İşlemler', href: '/finans', icon: Wallet },
			{ label: 'Raporlar', href: '/raporlar', icon: ChartColumn }
		]
	},
	{
		label: 'Bağlantılar',
		items: [
			{ label: 'GHL', href: '/baglantilar/ghl', icon: Link2 },
			{ label: 'Reklamlar', href: '/baglantilar/reklamlar', icon: Megaphone },
			{ label: 'n8n / API', href: '/baglantilar/api', icon: Webhook }
		]
	},
	{
		label: 'Yönetim',
		items: [
			{ label: 'Ekip', href: '/yonetim/ekip', icon: UsersRound },
			{ label: 'Ayarlar', href: '/yonetim/ayarlar', icon: Settings },
			{ label: 'Denetim Kaydı', href: '/yonetim/denetim', icon: ScrollText }
		]
	}
];

/** Mobil alt sekme — ana kısayollar; "Menü" tam navigasyonu açar */
export const mobileTabItems: NavItem[] = [
	{ label: 'Panel', href: '/', icon: LayoutDashboard },
	{ label: 'Hastalar', href: '/hastalar', icon: Users },
	{ label: 'Randevular', href: '/randevular', icon: Calendar },
	{ label: 'İşlemler', href: '/finans', icon: Wallet }
];
