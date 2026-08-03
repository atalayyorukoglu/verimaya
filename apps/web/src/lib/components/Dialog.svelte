<script lang="ts">
	import type { Snippet } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import { focusTrap } from '$lib/actions/focus-trap';
	import { portal } from '$lib/actions/portal';

	let {
		open = $bindable(false),
		title,
		description,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		description?: string;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const titleId = crypto.randomUUID();

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) open = false;
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
	<div use:portal class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
		<div
			role="presentation"
			class="absolute inset-0 bg-black/60"
			onclick={() => (open = false)}
		></div>
		<div
			use:focusTrap
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			tabindex="-1"
			class="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-[12px] border border-border bg-surface sm:max-w-lg sm:rounded-[8px]"
		>
			<div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
				<div class="min-w-0">
					<h2 id={titleId} class="text-base font-semibold text-text">{title}</h2>
					{#if description}
						<p class="mt-0.5 text-xs text-text-muted">{description}</p>
					{/if}
				</div>
				<button
					type="button"
					class="shrink-0 rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
					aria-label="Kapat"
					onclick={() => (open = false)}
				>
					<X class="size-4" />
				</button>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">
				{@render children()}
			</div>
			{#if footer}
				<div class="flex justify-end gap-2 border-t border-border px-4 py-3">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
