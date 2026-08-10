<script lang="ts">
	import type { Component } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
	import Megaphone from '@lucide/svelte/icons/megaphone';

	type HubCard = {
		href: string;
		titleKey: 'nav.scorecard' | 'nav.marketingOverview';
		descriptionKey: 'nav.tools.card.scorecard' | 'nav.tools.card.campaigns';
		icon: Component;
	};

	const cards: HubCard[] = [
		{
			href: '/scorecard',
			titleKey: 'nav.scorecard',
			descriptionKey: 'nav.tools.card.scorecard',
			icon: ClipboardCheck
		},
		{
			href: '/marketing',
			titleKey: 'nav.marketingOverview',
			descriptionKey: 'nav.tools.card.campaigns',
			icon: Megaphone
		}
	];
</script>

<svelte:head>
	<title>{t('nav.tools.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('nav.tools.title')} description={t('nav.tools.description')} />

	<ul class="grid gap-3 sm:grid-cols-2">
		{#each cards as card (card.href)}
			{@const Icon = card.icon}
			<li class="flex min-h-0">
				<a
					href={card.href}
					class="flex h-full w-full items-start gap-3 rounded-lg border border-border bg-surface p-5 transition-colors hover:bg-surface-2"
				>
					<Icon class="mt-0.5 size-4 shrink-0 text-text-muted" />
					<div class="min-w-0 flex-1">
						<h2 class="font-medium text-text">{t(card.titleKey)}</h2>
						<p class="mt-0.5 text-sm text-text-muted">{t(card.descriptionKey)}</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</div>
