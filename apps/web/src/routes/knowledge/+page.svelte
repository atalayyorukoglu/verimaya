<script lang="ts">
	import type { Component } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import BookOpen from '@lucide/svelte/icons/book-open';

	type HubCard = {
		href: string;
		titleKey: 'nav.aiPrep' | 'nav.docs';
		descriptionKey: 'nav.resources.card.aiPrep' | 'nav.resources.card.docs';
		icon: Component;
	};

	const cards: HubCard[] = [
		{
			href: '/resources/ai-prep',
			titleKey: 'nav.aiPrep',
			descriptionKey: 'nav.resources.card.aiPrep',
			icon: Sparkles
		},
		{
			href: '/resources/docs',
			titleKey: 'nav.docs',
			descriptionKey: 'nav.resources.card.docs',
			icon: BookOpen
		}
	];
</script>

<svelte:head>
	<title>{t('nav.resources.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('nav.resources.title')} description={t('nav.resources.description')} />

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
