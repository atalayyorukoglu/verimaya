<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type ConnectionStatus = 'connected' | 'disconnected' | 'planned';

	let {
		name,
		description,
		status,
		meta = [],
		actionLabel
	}: {
		name: string;
		description: string;
		status: ConnectionStatus;
		/** Key/value rows shown when relevant, e.g. "Son senkron" */
		meta?: { label: string; value: string }[];
		actionLabel?: string;
	} = $props();

	const statusInfo: Record<
		ConnectionStatus,
		{ label: string; tone: 'success' | 'neutral' | 'warning' }
	> = {
		connected: { label: 'Bağlı', tone: 'success' },
		disconnected: { label: 'Bağlı değil', tone: 'neutral' },
		planned: { label: 'Planlandı', tone: 'warning' }
	};
</script>

<div class="min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4 sm:p-5">
	<div class="flex min-w-0 items-start justify-between gap-3">
		<div class="min-w-0">
			<h2 class="truncate text-sm font-semibold text-text">{name}</h2>
			<p class="mt-1 text-sm leading-relaxed text-text-muted">{description}</p>
		</div>
		<StatusBadge label={statusInfo[status].label} tone={statusInfo[status].tone} />
	</div>

	{#if meta.length > 0}
		<dl class="mt-4 grid gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-2">
			{#each meta as row (row.label)}
				<div class="flex items-baseline justify-between gap-4 sm:block">
					<dt class="text-xs text-text-faint">{row.label}</dt>
					<dd class="text-xs text-text sm:mt-0.5">{row.value}</dd>
				</div>
			{/each}
		</dl>
	{/if}

	{#if actionLabel}
		<div class="mt-4">
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled
				title="Gerçek bağlantı akışı backend ile birlikte gelecek"
			>
				{actionLabel}
			</Button>
		</div>
	{/if}
</div>
