<script lang="ts">
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';

	type ConnectionStatus = 'connected' | 'disconnected' | 'planned';

	let {
		name,
		description,
		status,
		meta = [],
		actionLabel,
		actionHref,
		onDisconnect
	}: {
		name: string;
		description: string;
		status: ConnectionStatus;
		/** Key/value rows shown when relevant, e.g. "Son senkron" */
		meta?: { label: string; value: string }[];
		actionLabel?: string;
		/** When set, primary action renders as an enabled link (OAuth authorize). */
		actionHref?: string;
		/** When set and status is connected, shows a secondary disconnect control. */
		onDisconnect?: () => void;
	} = $props();

	const statusInfo = $derived({
		connected: {
			label: t('integration.status.connected'),
			tone: 'success' as const
		},
		disconnected: {
			label: t('integration.status.disconnected'),
			tone: 'neutral' as const
		},
		planned: {
			label: t('integration.status.planned'),
			tone: 'warning' as const
		}
	});

	const showActions = $derived(
		Boolean(actionLabel) || (Boolean(onDisconnect) && status === 'connected')
	);
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

	{#if showActions}
		<div class="mt-4 flex flex-wrap gap-2">
			{#if actionLabel}
				{#if actionHref}
					<a
						href={actionHref}
						class="inline-flex h-8 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-3 text-xs font-medium whitespace-nowrap text-text transition-colors hover:bg-surface-2"
					>
						{actionLabel}
					</a>
				{:else}
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled
						title={t('integration.connectDisabledTitle')}
					>
						{actionLabel}
					</Button>
				{/if}
			{/if}
			{#if onDisconnect && status === 'connected'}
				<Button type="button" variant="outline" size="sm" onclick={onDisconnect}>
					{t('integration.disconnect')}
				</Button>
			{/if}
		</div>
	{/if}
</div>
