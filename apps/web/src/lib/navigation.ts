import type { Component } from 'svelte';
import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
import Users from '@lucide/svelte/icons/users';
import Contact from '@lucide/svelte/icons/contact';
import Calendar from '@lucide/svelte/icons/calendar';
import Wallet from '@lucide/svelte/icons/wallet';
import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
import ChartColumn from '@lucide/svelte/icons/chart-column';
import Megaphone from '@lucide/svelte/icons/megaphone';
import Calculator from '@lucide/svelte/icons/calculator';
import FlaskConical from '@lucide/svelte/icons/flask-conical';
import ShieldCheck from '@lucide/svelte/icons/shield-check';
import LayoutTemplate from '@lucide/svelte/icons/layout-template';
import Gauge from '@lucide/svelte/icons/gauge';
import Settings from '@lucide/svelte/icons/settings';
import UserCog from '@lucide/svelte/icons/user-cog';
import Sparkles from '@lucide/svelte/icons/sparkles';
import Bell from '@lucide/svelte/icons/bell';

export type NavItem = {
	label: string;
	href: string;
	icon: Component;
};

export type NavGroup = {
	label: string;
	items: NavItem[];
};

/** Panel nav — CF dashboard grupları, TickPort renkleri; docs/TASARIM.md */
export const navGroups: NavGroup[] = [
	{
		label: 'Ana',
		items: [
			{ label: 'Panel', href: '/', icon: LayoutDashboard },
			{ label: 'Hastalar', href: '/hastalar', icon: Users },
			{ label: 'Kişiler', href: '/kisiler', icon: Contact },
			{ label: 'Randevular', href: '/randevular', icon: Calendar }
		]
	},
	{
		label: 'Finans',
		items: [
			{ label: 'İşlemler', href: '/finans', icon: Wallet },
			{ label: 'Bakiyeler', href: '/finans/bakiyeler', icon: ArrowLeftRight },
			{ label: 'Raporlar', href: '/raporlar', icon: ChartColumn }
		]
	},
	{
		label: 'Pazarlama',
		items: [
			{ label: 'Genel Bakış', href: '/pazarlama', icon: Megaphone },
			{ label: 'Hesap', href: '/pazarlama/hesap', icon: Calculator },
			{ label: 'Simülatör', href: '/pazarlama/simulator', icon: FlaskConical },
			{ label: 'Uyumluluk', href: '/pazarlama/uyumluluk', icon: ShieldCheck },
			{ label: 'Şablonlar', href: '/pazarlama/sablonlar', icon: LayoutTemplate },
			{ label: 'Ölçüm', href: '/pazarlama/olcum', icon: Gauge }
		]
	},
	{
		label: 'Sistem',
		items: [
			{ label: 'Ayarlar', href: '/ayarlar', icon: Settings },
			{ label: 'Özellikler', href: '/ozellikler', icon: Sparkles },
			{ label: 'Yenilikler', href: '/yenilikler', icon: Bell },
			{ label: 'Geliştirici', href: '/dev', icon: UserCog }
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
