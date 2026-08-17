<script lang="ts">
	import type { Component } from 'svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Building2 from '@lucide/svelte/icons/building-2';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Lock from '@lucide/svelte/icons/lock';
	import Users from '@lucide/svelte/icons/users';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Bot from '@lucide/svelte/icons/bot';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import Contact from '@lucide/svelte/icons/contact';
	import Link2 from '@lucide/svelte/icons/link-2';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Webhook from '@lucide/svelte/icons/webhook';

	type Card = {
		href: string;
		title: string;
		description: string;
		icon: Component;
		badge?: string;
		tone?: 'danger';
	};

	type Section = { label: string; cards: Card[]; tone?: 'danger' };

	const sections = $derived<Section[]>([
		{
			label: 'Organizasyon',
			cards: [
				{
					href: '/settings/organization',
					title: t('settings.organization.title'),
					description: t('settings.nav.org.description'),
					icon: Building2
				},
				{
					href: '/settings/team',
					title: 'Ekip',
					description: t('settings.nav.team.description'),
					icon: Users
				},
				{
					href: '/settings/access',
					title: t('settings.nav.access.title'),
					description: 'Rol → izin matrisi (demo, salt okunur).',
					icon: Lock
				},
				{
					href: '/settings/audit',
					title: t('settings.nav.audit.title'),
					description: t('settings.nav.audit.description'),
					icon: ScrollText
				}
			]
		},
		{
			label: 'Operasyon',
			cards: [
				{
					href: '/settings/categories',
					title: 'Kategoriler',
					description: t('settings.nav.categories.description'),
					icon: FolderTree
				},
				{
					href: '/settings/appointment-types',
					title: t('settings.nav.appointmentTypes.title'),
					description: t('settings.nav.appointmentTypes.description'),
					icon: CalendarDays
				},
				{
					href: '/settings/contact-types',
					title: t('settings.nav.contactTypes.title'),
					description: 'Otel, klinik, transfer, hasta…',
					icon: Contact
				},
				{
					href: '/settings/organizations',
					title: t('settings.nav.organizations.title'),
					description: t('settings.nav.organizations.description'),
					icon: Building2
				},
				{
					href: '/settings/incentives',
					title: t('settings.nav.incentives.title'),
					description: t('settings.nav.incentives.description'),
					icon: FolderTree
				},
				{
					href: '/settings/import-export',
					title: t('settings.nav.importExport.title'),
					description: 'Toplu import-export (ETL).',
					icon: FileSpreadsheet,
					badge: 'Faz 8'
				}
			]
		},
		{
			label: t('settings.nav.connections'),
			cards: [
				{
					href: '/settings/connections/ghl',
					title: 'GHL',
					description: t('settings.nav.ghl.description'),
					icon: Link2
				},
				{
					href: '/settings/connections/ads',
					title: 'Reklamlar',
					description: 'Meta ve Google Ads harcama / lead.',
					icon: Megaphone
				},
				{
					href: '/settings/connections/api',
					title: 'n8n / API',
					description: t('settings.nav.api.description'),
					icon: Webhook
				}
			]
		},
		{
			label: 'AI & kalite',
			cards: [
				{
					href: '/settings/knowledge',
					title: t('settings.nav.knowledge.title'),
					description: t('settings.nav.knowledge.description'),
					icon: BookOpen
				},
				{
					href: '/settings/ai',
					title: t('settings.nav.ai.title'),
					description: t('settings.nav.ai.description'),
					icon: Bot,
					badge: 'Demo'
				},
				{
					href: '/settings/ai-learning',
					title: t('settings.nav.aiLearning.title'),
					description: t('settings.nav.aiLearning.description'),
					icon: ChartColumn,
					badge: 'Demo'
				},
				{
					href: '/settings/data-quality',
					title: 'Veri kalitesi',
					description: t('settings.nav.dataQuality.description'),
					icon: ShieldCheck,
					badge: 'Demo'
				}
			]
		},
		{
			label: t('settings.nav.dangerZone'),
			tone: 'danger',
			cards: [
				{
					href: '/settings/data-delete',
					title: t('settings.nav.dataDelete.title'),
					description: t('settings.nav.dataDelete.description'),
					icon: TriangleAlert,
					tone: 'danger'
				}
			]
		}
	]);
</script>

<svelte:head>
	<title>{t('settings.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('settings.title')} description={t('settings.description')} />

	<div class="space-y-8">
		{#each sections as section (section.label)}
			<section>
				<h2
					class="mb-3 text-xs font-semibold tracking-wider uppercase {section.tone === 'danger'
						? 'text-danger'
						: 'text-text-muted'}"
				>
					{section.label}
				</h2>
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each section.cards as card (card.href)}
						{@const Icon = card.icon}
						<li class="flex min-h-0">
							<a
								href={card.href}
								class="flex h-full min-h-[7rem] w-full items-start gap-3 rounded-lg border p-4 transition-colors {card.tone ===
								'danger'
									? 'border-danger/40 bg-danger/5 hover:bg-danger/10'
									: 'border-border bg-surface hover:bg-surface-2/60'}"
							>
								<Icon
									class="mt-0.5 size-4 shrink-0 {card.tone === 'danger'
										? 'text-danger'
										: 'text-text-muted'}"
								/>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="font-medium text-text">{card.title}</h3>
										{#if card.badge}
											<span
												class="rounded-[4px] bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-text-muted"
											>
												{card.badge}
											</span>
										{/if}
									</div>
									<p class="mt-0.5 text-sm text-text-muted">{card.description}</p>
								</div>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	</div>
</div>
