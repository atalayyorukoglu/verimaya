<script lang="ts">
	import type { Snippet } from 'svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';

	let {
		title,
		description,
		hint = 'Bu alan Faz 0b sonrası gerçek veriye bağlanacak. Şimdilik yer tutucu.',
		ctaHref = '/ozellikler',
		ctaLabel = 'Özelliklere bak',
		children
	}: {
		title: string;
		description: string;
		hint?: string;
		ctaHref?: string;
		ctaLabel?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="mx-auto min-w-0 max-w-3xl">
	<PageHeader {title} {description} />
	<div class="border-border bg-surface overflow-hidden rounded-lg border p-6 sm:p-8">
		{#if children}
			{@render children()}
		{:else}
			<div class="text-center">
				<p class="text-text text-sm font-medium">Henüz içerik yok</p>
				<p class="text-text-muted mx-auto mt-2 max-w-md text-sm leading-relaxed">{hint}</p>
				<a
					href={ctaHref}
					class="bg-surface-2 text-text hover:bg-border mt-5 inline-flex h-9 items-center rounded-[6px] px-4 text-sm font-medium"
				>
					{ctaLabel}
				</a>
			</div>
		{/if}
	</div>
</div>
