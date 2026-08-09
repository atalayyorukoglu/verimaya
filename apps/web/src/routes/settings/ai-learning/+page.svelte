<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { AiCorrectionsReport } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	const qs = useQueryScope();

	const reportQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.correctionsReport({}),
		queryFn: () => apiGet<AiCorrectionsReport>(apiPaths.whatsappCorrectionsReport),
		enabled: qs.ready
	}));

	const items = $derived(reportQuery.data?.items ?? []);
</script>

<svelte:head>
	<title>{t('settings.aiLearning.title')} · {t('settings.ai.title')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.aiLearning.title')}
		description={t('settings.aiLearning.description')}
	/>

	{#if reportQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.aiLearning.loading')}</p>
	{:else if reportQuery.isError}
		<p class="text-sm text-danger">{t('settings.aiLearning.loadError')}</p>
	{:else if items.length === 0}
		<p class="text-sm text-text-muted">{t('settings.aiLearning.empty')}</p>
	{:else}
		<section class="overflow-hidden rounded-lg border border-border bg-surface">
			<div class="border-b border-border px-4 py-3">
				<h2 class="text-sm font-semibold text-text">{t('settings.aiLearning.summary.heading')}</h2>
			</div>
			<table class="w-full text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="px-4 py-2.5 font-medium">{t('settings.aiLearning.col.field')}</th>
						<th class="px-4 py-2.5 font-medium">{t('settings.aiLearning.col.corrections')}</th>
						<th class="px-4 py-2.5 font-medium">{t('settings.aiLearning.col.messages')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as row (row.field)}
						<tr class={row.correction_count >= 3 ? 'bg-warning/10' : ''}>
							<td class="px-4 py-2.5 font-medium text-text">
								<code class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{row.field}</code
								>
							</td>
							<td class="px-4 py-2.5 text-text-muted tabular-nums">{row.correction_count}</td>
							<td class="px-4 py-2.5 text-text-muted tabular-nums">{row.distinct_messages}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<p class="mt-3 text-xs text-text-faint">{t('settings.aiLearning.footnote')}</p>
</div>
