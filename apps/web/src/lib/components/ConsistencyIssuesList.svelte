<script lang="ts">
	import {
		reportConsistencyCodeMeta,
		type ReportConsistency,
		type ReportConsistencyCode
	} from '@verimaya/shared';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	let {
		data,
		compact = false
	}: {
		data: ReportConsistency;
		compact?: boolean;
	} = $props();

	let expandedCode = $state<ReportConsistencyCode | null>(null);

	const errorItems = $derived(data.items.filter((item) => item.severity === 'error'));

	const warningGroups = $derived(
		(Object.entries(data.counts_by_code) as Array<[ReportConsistencyCode, number]>)
			.filter(
				([code, count]) => count > 0 && reportConsistencyCodeMeta[code].severity === 'warning'
			)
			.sort((a, b) => b[1] - a[1])
			.map(([code, count]) => ({
				code,
				count,
				message_key: reportConsistencyCodeMeta[code].message_key
			}))
	);

	const expandedItems = $derived(
		expandedCode == null ? [] : data.items.filter((item) => item.code === expandedCode)
	);

	const expandedTotal = $derived(
		expandedCode == null ? 0 : (data.counts_by_code[expandedCode] ?? 0)
	);

	function toggleGroup(code: ReportConsistencyCode) {
		expandedCode = expandedCode === code ? null : code;
	}
</script>

<ul class="{compact ? 'mt-3' : 'mt-4'} divide-y divide-border">
	{#each errorItems as issue (`${issue.transaction_id}-${issue.code}`)}
		<li
			class="flex min-w-0 items-start {compact
				? 'justify-between gap-2 py-2 text-sm'
				: 'gap-3 py-3 first:pt-0 last:pb-0'}"
		>
			{#if !compact}
				<span
					class="mt-0.5 shrink-0 rounded-[6px] bg-danger/15 px-2 py-0.5 text-[10px] font-semibold text-danger uppercase"
				>
					{t('reports.consistency.error')}
				</span>
			{/if}
			<div class="min-w-0 {compact ? '' : 'flex-1'}">
				<p class="truncate {compact ? 'font-medium text-text' : 'text-sm font-medium text-text'}">
					{issue.title}
				</p>
				<p class={compact ? 'mt-0.5 text-text-muted' : 'mt-0.5 text-sm text-text-muted'}>
					{t(issue.message_key as MessageKey)}
				</p>
			</div>
			<a
				href="/finance"
				class="shrink-0 text-xs {compact
					? 'text-brand hover:underline'
					: 'font-medium text-brand hover:underline'}"
			>
				{t('reports.consistency.fix')}
			</a>
		</li>
	{/each}

	{#each warningGroups as group (group.code)}
		<li class={compact ? 'py-2' : 'py-3 first:pt-0 last:pb-0'}>
			<div class="flex min-w-0 items-start gap-3">
				{#if !compact}
					<span
						class="mt-0.5 shrink-0 rounded-[6px] bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning uppercase"
					>
						{t('reports.consistency.warning')}
					</span>
				{/if}
				<div class="min-w-0 flex-1">
					<p class={compact ? 'text-sm font-medium text-text' : 'text-sm font-medium text-text'}>
						{t('reports.consistency.groupSummary', {
							count: group.count,
							message: t(group.message_key as MessageKey)
						})}
					</p>
				</div>
				<button
					type="button"
					class="shrink-0 text-xs font-medium text-brand hover:underline"
					onclick={() => toggleGroup(group.code)}
				>
					{expandedCode === group.code
						? t('reports.consistency.hide')
						: t('reports.consistency.show')}
				</button>
			</div>

			{#if expandedCode === group.code}
				<ul class="mt-2 space-y-2 border-l-2 border-border pl-3">
					{#each expandedItems as issue (`${issue.transaction_id}-${issue.code}`)}
						<li class="flex min-w-0 items-start justify-between gap-2 text-sm">
							<div class="min-w-0">
								<p class="truncate font-medium text-text">{issue.title}</p>
								<p class="mt-0.5 text-xs text-text-muted">{issue.occurred_on}</p>
							</div>
							<a href="/finance" class="shrink-0 text-xs text-brand hover:underline">
								{t('reports.consistency.fix')}
							</a>
						</li>
					{/each}
				</ul>
				{#if expandedTotal > expandedItems.length}
					<p class="mt-2 text-xs text-text-muted">
						{t('reports.consistency.truncated', { count: expandedTotal })}
					</p>
				{/if}
			{/if}
		</li>
	{/each}
</ul>
