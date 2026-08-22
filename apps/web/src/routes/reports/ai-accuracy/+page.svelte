<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import { apiPaths, type AiAccuracyReport, type MayaToolName, type Tenant } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime, formatPercent } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { resolvePeriodRange, type PeriodKey } from '$lib/period-range';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodSelector from '$lib/components/PeriodSelector.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));
	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	let periodKey = $state<PeriodKey>('bu-ay');
	let customFrom = $state('');
	let customTo = $state('');

	const dateRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	function buildUrl(from: string | null, to: string | null): string {
		const params = new URLSearchParams();
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		const q = params.toString();
		return q ? `${apiPaths.reportsAiAccuracy}?${q}` : apiPaths.reportsAiAccuracy;
	}

	const reportQuery = createQuery(() => ({
		queryKey: qs.keys.reports.aiAccuracy({ from: dateRange.from, to: dateRange.to }),
		queryFn: () => apiGet<AiAccuracyReport>(buildUrl(dateRange.from, dateRange.to)),
		enabled: qs.ready
	}));

	const data = $derived(reportQuery.data);

	function confidenceLabel(confidence: 'high' | 'medium' | 'low' | null): string {
		if (confidence === 'high') return t('reports.aiAccuracy.drafts.confidence.high');
		if (confidence === 'medium') return t('reports.aiAccuracy.drafts.confidence.medium');
		if (confidence === 'low') return t('reports.aiAccuracy.drafts.confidence.low');
		return t('reports.aiAccuracy.drafts.confidence.unknown');
	}

	function confidenceTone(
		confidence: 'high' | 'medium' | 'low' | null
	): 'success' | 'warning' | 'danger' | 'neutral' {
		if (confidence === 'high') return 'success';
		if (confidence === 'medium') return 'warning';
		if (confidence === 'low') return 'danger';
		return 'neutral';
	}

	function toolLabel(tool: MayaToolName): string {
		switch (tool) {
			case 'contactBalance':
				return t('maya.tool.name.contactBalance');
			case 'openBalances':
				return t('maya.tool.name.openBalances');
			case 'contactAppointments':
				return t('maya.tool.name.contactAppointments');
			case 'periodSummary':
				return t('maya.tool.name.periodSummary');
			case 'untouchedContacts':
				return t('maya.tool.name.untouchedContacts');
		}
	}

	function sourceLabel(source: 'knowledge' | 'tool' | 'unknown'): string {
		if (source === 'knowledge') return t('reports.aiAccuracy.maya.source.knowledge');
		if (source === 'tool') return t('reports.aiAccuracy.maya.source.tool');
		return t('reports.aiAccuracy.maya.source.unknown');
	}
</script>

<svelte:head>
	<title>{t('reports.aiAccuracy.title')} · {t('reports.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/reports')} class="text-sm font-medium text-brand hover:underline">
			← {t('reports.title')}
		</a>
	</div>

	<PageHeader title={t('reports.aiAccuracy.title')} description={t('reports.aiAccuracy.description')} />

	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	{#if reportQuery.isPending}
		<p class="text-sm text-text-muted">{t('reports.aiAccuracy.loading')}</p>
	{:else if reportQuery.isError}
		<p class="text-sm text-danger">{t('reports.aiAccuracy.loadError')}</p>
	{:else if data}
		<!-- 1) AI ne kadar isabetli? -->
		<section class="rounded-lg border border-border bg-surface p-4 sm:p-6">
			<h2 class="text-sm font-semibold text-text">{t('reports.aiAccuracy.drafts.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('reports.aiAccuracy.drafts.description')}</p>

			{#if data.drafts.approved_message_count === 0}
				<p class="mt-4 text-sm text-text-muted">{t('reports.aiAccuracy.drafts.empty')}</p>
			{:else}
				<div class="mt-4 grid grid-cols-3 gap-3">
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.drafts.approved')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">
							{data.drafts.approved_message_count}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.drafts.corrected')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">
							{data.drafts.corrected_message_count}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.drafts.unchangedRate')}</p>
						<p class="mt-1 text-lg font-semibold text-success tabular-nums">
							{data.drafts.unchanged_rate == null ? '—' : formatPercent(data.drafts.unchanged_rate)}
						</p>
					</div>
				</div>

				{#if data.drafts.by_field.length > 0}
					<p class="mt-5 mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
						{t('reports.aiAccuracy.drafts.byFieldTitle')}
					</p>
					<div class="overflow-x-auto rounded-lg border border-border">
						<table class="w-full min-w-[28rem] text-left text-sm">
							<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
								<tr>
									<th class="px-3 py-2 font-medium">{t('reports.aiAccuracy.drafts.colField')}</th>
									<th class="px-3 py-2 text-right font-medium"
										>{t('reports.aiAccuracy.drafts.colCount')}</th
									>
									<th class="px-3 py-2 text-right font-medium"
										>{t('reports.aiAccuracy.drafts.colMessages')}</th
									>
									<th class="px-3 py-2 font-medium">{t('reports.aiAccuracy.drafts.colConfidence')}</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each data.drafts.by_field as row (row.field)}
									<tr>
										<td class="px-3 py-2.5 font-medium text-text">
											<code class="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs"
												>{row.field}</code
											>
										</td>
										<td class="px-3 py-2.5 text-right text-text-muted tabular-nums"
											>{row.correction_count}</td
										>
										<td class="px-3 py-2.5 text-right text-text-muted tabular-nums"
											>{row.distinct_messages}</td
										>
										<td class="px-3 py-2.5">
											<div class="flex flex-wrap gap-1">
												{#each row.by_confidence as c (c.confidence ?? 'null')}
													<StatusBadge
														label="{confidenceLabel(c.confidence)} · {c.correction_count}"
														tone={confidenceTone(c.confidence)}
													/>
												{/each}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</section>

		<!-- 2) Nerede yanılıyor? -->
		<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<h2 class="text-sm font-semibold text-text">{t('reports.aiAccuracy.suggestions.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('reports.aiAccuracy.suggestions.description')}</p>

			{#if data.suggestions.total === 0}
				<p class="mt-4 text-sm text-text-muted">{t('reports.aiAccuracy.suggestions.empty')}</p>
			{:else}
				<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.suggestions.approved')}</p>
						<p class="mt-1 text-lg font-semibold text-success tabular-nums">
							{data.suggestions.approved}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.suggestions.rejected')}</p>
						<p class="mt-1 text-lg font-semibold text-danger tabular-nums">
							{data.suggestions.rejected}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.suggestions.pending')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">
							{data.suggestions.pending}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.suggestions.acceptanceRate')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">
							{data.suggestions.acceptance_rate == null
								? '—'
								: formatPercent(data.suggestions.acceptance_rate)}
						</p>
					</div>
				</div>

				<p class="mt-5 mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
					{t('reports.aiAccuracy.suggestions.reasonsTitle')}
				</p>
				{#if data.suggestions.reject_reasons.length === 0}
					<p class="text-sm text-text-muted">{t('reports.aiAccuracy.suggestions.reasonsEmpty')}</p>
				{:else}
					<ul class="divide-y divide-border">
						{#each data.suggestions.reject_reasons as row (row.reason ?? '__none__')}
							<li class="flex items-center justify-between gap-3 py-2 text-sm">
								<span class="min-w-0 truncate text-text">
									{row.reason ?? t('reports.aiAccuracy.suggestions.noReason')}
								</span>
								<span class="shrink-0 text-xs text-text-muted tabular-nums">{row.count}</span>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>

		<!-- 3) Maya neyi bilmiyor? -->
		<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<h2 class="text-sm font-semibold text-text">{t('reports.aiAccuracy.maya.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('reports.aiAccuracy.maya.description')}</p>

			{#if data.maya.total === 0}
				<p class="mt-4 text-sm text-text-muted">{t('reports.aiAccuracy.maya.empty')}</p>
			{:else}
				<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.maya.total')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">{data.maya.total}</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.maya.answered')}</p>
						<p class="mt-1 text-lg font-semibold text-success tabular-nums">{data.maya.answered}</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.maya.unanswered')}</p>
						<p class="mt-1 text-lg font-semibold text-warning tabular-nums">
							{data.maya.unanswered}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.aiAccuracy.maya.answerRate')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">
							{data.maya.answer_rate == null ? '—' : formatPercent(data.maya.answer_rate)}
						</p>
					</div>
				</div>

				<div class="mt-5 grid gap-4 sm:grid-cols-2">
					<div>
						<p class="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('reports.aiAccuracy.maya.bySourceTitle')}
						</p>
						<ul class="divide-y divide-border">
							{#each data.maya.by_source as row (row.source)}
								<li class="flex items-center justify-between gap-2 py-1.5 text-sm">
									<span class="text-text">{sourceLabel(row.source)}</span>
									<span class="text-xs text-text-muted tabular-nums">{row.count}</span>
								</li>
							{/each}
						</ul>
					</div>
					<div>
						<p class="mb-2 text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('reports.aiAccuracy.maya.byToolTitle')}
						</p>
						{#if data.maya.by_tool.length === 0}
							<p class="text-sm text-text-faint">—</p>
						{:else}
							<ul class="divide-y divide-border">
								{#each data.maya.by_tool as row (row.tool)}
									<li class="flex items-center justify-between gap-2 py-1.5 text-sm">
										<span class="text-text">{toolLabel(row.tool)}</span>
										<span class="text-xs text-text-muted tabular-nums">{row.count}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>

				<div class="mt-5">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('reports.aiAccuracy.maya.unansweredTitle')}
						</p>
						<div class="flex gap-3 text-xs">
							<a href={resolve('/settings/knowledge')} class="font-medium text-brand hover:underline">
								{t('reports.aiAccuracy.maya.addToKnowledge')}
							</a>
							<a href={resolve('/settings/ai')} class="font-medium text-brand hover:underline">
								{t('reports.aiAccuracy.maya.editPrompt')}
							</a>
						</div>
					</div>
					<p class="mt-1 text-xs text-text-muted">{t('reports.aiAccuracy.maya.unansweredHint')}</p>

					{#if data.maya.unanswered_samples.length === 0}
						<p class="mt-3 text-sm text-text-muted">{t('reports.aiAccuracy.maya.unansweredEmpty')}</p>
					{:else}
						<ul class="mt-3 space-y-2">
							{#each data.maya.unanswered_samples as sample (sample.created_at + sample.question_masked)}
								<li class="rounded-lg border border-border bg-surface-2/30 px-3 py-2 text-sm">
									<p class="text-text">{sample.question_masked}</p>
									<p class="mt-0.5 text-xs text-text-faint">{formatDateTime(sample.created_at)}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		</section>
	{/if}

	<p class="mt-4 text-xs text-text-faint">{t('reports.aiAccuracy.footnote')}</p>
</div>
