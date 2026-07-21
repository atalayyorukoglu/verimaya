<script lang="ts">
	import type { Component } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Building2 from '@lucide/svelte/icons/building-2';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import Lock from '@lucide/svelte/icons/lock';
	import Users from '@lucide/svelte/icons/users';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Bot from '@lucide/svelte/icons/bot';
	import ChartColumn from '@lucide/svelte/icons/chart-column';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
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
	};

	type Section = { label: string; cards: Card[] };

	const sections: Section[] = [
		{
			label: 'Organizasyon',
			cards: [
				{
					href: '/ayarlar/organizasyon',
					title: 'Organizasyon',
					description: 'Firma adı, baz para birimi ve bölüm etiketleri.',
					icon: Building2
				},
				{
					href: '/ayarlar/ekip',
					title: 'Ekip',
					description: 'Üyeler ve roller.',
					icon: Users
				},
				{
					href: '/ayarlar/erisim',
					title: 'Erişim',
					description: 'Rol → izin matrisi (demo, salt okunur).',
					icon: Lock
				},
				{
					href: '/ayarlar/denetim',
					title: 'Denetim kaydı',
					description: 'Kim ne yaptı — operasyon geçmişi.',
					icon: ScrollText
				}
			]
		},
		{
			label: 'Operasyon',
			cards: [
				{
					href: '/ayarlar/kategoriler',
					title: 'Kategoriler',
					description: 'Gelir/gider kategorileri, alt kategoriler ve sıra.',
					icon: FolderTree
				},
				{
					href: '/ayarlar/randevular',
					title: 'Randevu ayarları',
					description: 'Randevu tipleri (checklist şablonları Faz 1).',
					icon: CalendarDays
				},
				{
					href: '/ayarlar/contact-turleri',
					title: 'Kişi türleri',
					description: 'Otel, klinik, transfer, hasta…',
					icon: Contact
				},
				{
					href: '/ayarlar/ice-akta',
					title: 'İçe / dışa aktar',
					description: 'Toplu import-export (ETL).',
					icon: FileSpreadsheet,
					badge: 'Faz 8'
				}
			]
		},
		{
			label: 'Bağlantılar',
			cards: [
				{
					href: '/ayarlar/baglantilar/ghl',
					title: 'GHL',
					description: 'GoHighLevel lead/iletişim senkronu.',
					icon: Link2
				},
				{
					href: '/ayarlar/baglantilar/reklamlar',
					title: 'Reklamlar',
					description: 'Meta ve Google Ads harcama / lead.',
					icon: Megaphone
				},
				{
					href: '/ayarlar/baglantilar/api',
					title: 'n8n / API',
					description: 'API anahtarları ve giden webhook’lar.',
					icon: Webhook
				}
			]
		},
		{
			label: 'AI & kalite',
			cards: [
				{
					href: '/ayarlar/ai',
					title: 'AI ayarları',
					description: 'WhatsApp işlem aktarımı prompt’u.',
					icon: Bot,
					badge: 'Demo'
				},
				{
					href: '/ayarlar/ai-ogrenme',
					title: 'AI öğrenme raporu',
					description: 'İnsan düzeltmeleri — hangi alanda ne sıklıkla.',
					icon: ChartColumn,
					badge: 'Demo'
				},
				{
					href: '/ayarlar/veri-kalitesi',
					title: 'Veri kalitesi',
					description: 'İşlem özeti, eksik alanlar; kişi/hasta çift kayıt linkleri.',
					icon: ShieldCheck,
					badge: 'Demo'
				}
			]
		}
	];
</script>

<svelte:head>
	<title>Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title="Ayarlar"
		description="Organizasyon, bağlantılar, finans kategorileri ve tercihler."
	/>

	<div class="space-y-8">
		{#each sections as section (section.label)}
			<section>
				<h2 class="mb-3 text-xs font-semibold tracking-wider text-text-muted uppercase">
					{section.label}
				</h2>
				<ul class="grid gap-3 sm:grid-cols-2">
					{#each section.cards as card (card.href)}
						{@const Icon = card.icon}
						<li class="flex min-h-0">
							<a
								href={card.href}
								class="flex h-full min-h-[7rem] w-full items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-2/60"
							>
								<Icon class="mt-0.5 size-4 shrink-0 text-text-muted" />
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
