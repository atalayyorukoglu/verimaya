<script lang="ts">
	import type { Snippet } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';

	let {
		title,
		description,
		hint = undefined,
		ctaHref = '/features',
		ctaLabel = undefined,
		children
	}: {
		title: string;
		description: string;
		hint?: string;
		ctaHref?: string;
		ctaLabel?: string;
		children?: Snippet;
	} = $props();

	const resolvedHint = $derived(hint ?? t('placeholder.defaultHint'));
	const resolvedCtaLabel = $derived(ctaLabel ?? t('placeholder.defaultCta'));
</script>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader {title} {description} />
	<div class="overflow-hidden rounded-lg border border-border bg-surface p-6 sm:p-8">
		{#if children}
			{@render children()}
		{:else}
			<div class="text-center">
				<p class="text-sm font-medium text-text">{t('placeholder.emptyTitle')}</p>
				<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">{resolvedHint}</p>
				<a
					href={ctaHref}
					class="mt-5 inline-flex h-9 items-center rounded-[6px] bg-surface-2 px-4 text-sm font-medium text-text hover:bg-border"
				>
					{resolvedCtaLabel}
				</a>
			</div>
		{/if}
	</div>
</div>
