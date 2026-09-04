<script lang="ts">
	import type { Snippet } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import HelpSheet from '$lib/components/HelpSheet.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import type { HelpTopic } from '$lib/help-content';

	let {
		title,
		description,
		actions,
		helpTopic
	}: {
		title: string;
		description?: string;
		actions?: Snippet;
		/** Verilirse başlığın yanına ⓘ düğmesi çıkar; içerik `help-content.ts`'ten gelir. */
		helpTopic?: HelpTopic;
	} = $props();

	let helpOpen = $state(false);
</script>

<div class="mb-6 flex flex-row items-center justify-between gap-3">
	<div class="min-w-0">
		<h1
			class="flex items-center gap-1.5 text-base font-semibold tracking-tight break-words text-text sm:text-xl"
		>
			<span class="min-w-0 break-words">{title}</span>
			{#if helpTopic}
				<button
					type="button"
					class="shrink-0 rounded-full p-1 text-text-faint hover:bg-surface-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
					aria-label={t('help.open')}
					onclick={() => (helpOpen = true)}
				>
					<Info class="size-4" />
				</button>
			{/if}
		</h1>
		{#if description}
			<p class="mt-1 text-sm break-words text-text-muted">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
			{@render actions()}
		</div>
	{/if}
</div>

{#if helpTopic}
	<HelpSheet bind:open={helpOpen} topic={helpTopic} />
{/if}
