<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { ReportConsistency, ReportSummary, SupportedCurrency, Tenant, Transaction } from '@verimaya/shared';
	import { reportUrl, toTenantDayKey } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatMoney } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import ConsistencyIssuesList from '$lib/components/ConsistencyIssuesList.svelte';

	type TxPage = { items: Transaction[]; next_cursor: string | null };

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');
	const baseCurrency = $derived(
		(tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency
	);

	function daysAgoIso(days: number): string {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return toTenantDayKey(d, tenantTimezone);
	}

	const from = $derived(daysAgoIso(7));

	const consistencyQuery = createQuery(() => ({
		queryKey: qs.keys.reports.consistency({ from, to: null }),
		queryFn: () => apiGet<ReportConsistency>(reportUrl('consistency', { from })),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.summary({ from, to: null }),
		queryFn: () => apiGet<ReportSummary>(reportUrl('summary', { from })),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const txQuery = createQuery(() => ({
		queryKey: qs.keys.transactions.list({ for: 'data-quality-dupes', from }),
		queryFn: () => apiGet<TxPage>(listUrl('transactions', { limit: 100, from })),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const consistency = $derived(consistencyQuery.data);
	const issueCount = $derived(
		(consistency?.counts.error ?? 0) + (consistency?.counts.warning ?? 0)
	);
	const fxSummary = $derived(summaryQuery.data);

	const duplicates = $derived.by(() => {
		const items = txQuery.data?.items ?? [];
		const dupMap = new Map<string, Transaction[]>();
		for (const t of items) {
			const key = `${t.amount}|${t.currency}|${t.occurred_on}|${t.kind}`;
			const bucket = dupMap.get(key) ?? [];
			bucket.push(t);
			dupMap.set(key, bucket);
		}
		return [...dupMap.entries()]
			.filter(([, rows]) => rows.length > 1)
			.map(([key, rows]) => ({ key, count: rows.length, sample: rows[0]! }))
			.slice(0, 8);
	});
</script>

<svelte:head>
	<title>{t('settings.dataQuality.title')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.dataQuality.title')}
		description={t('settings.dataQuality.description')}
	/>

	{#if consistencyQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.dataQuality.loading')}</p>
	{:else if consistencyQuery.isError}
		<p class="text-sm text-danger">{t('settings.dataQuality.loadError')}</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">{t('settings.dataQuality.stat.issues')}</p>
				<p class="mt-1 text-lg font-semibold text-text tabular-nums">{issueCount}</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">{t('reports.consistency.error')}</p>
				<p class="mt-1 text-lg font-semibold text-danger tabular-nums">
					{consistency?.counts.error ?? 0}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">{t('reports.consistency.warning')}</p>
				<p class="mt-1 text-lg font-semibold text-warning tabular-nums">
					{consistency?.counts.warning ?? 0}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">{t('settings.dataQuality.stat.coverage')}</p>
				<p class="mt-1 text-lg font-semibold text-text tabular-nums">
					{#if fxSummary}
						{(fxSummary.coverage_ratio * 100).toFixed(0)}%
					{:else}
						—
					{/if}
				</p>
			</div>
		</div>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">{t('reports.consistency.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('settings.dataQuality.consistencyHint')}</p>
			{#if issueCount === 0}
				<p class="mt-3 text-sm text-success">{t('reports.consistency.clean')}</p>
			{:else if consistency}
				<ConsistencyIssuesList data={consistency} compact />
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">{t('settings.dataQuality.fx.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">
				{t('settings.dataQuality.fx.description', { currency: baseCurrency })}
			</p>
			{#if summaryQuery.isPending}
				<p class="mt-3 text-sm text-text-muted">{t('settings.dataQuality.loading')}</p>
			{:else if fxSummary && fxSummary.fx_missing_count === 0}
				<p class="mt-3 text-sm text-success">
					{t('settings.dataQuality.fx.clean', {
						pct: (fxSummary.coverage_ratio * 100).toFixed(0)
					})}
				</p>
			{:else if fxSummary}
				<p class="mt-3 text-sm text-warning">
					{t('settings.dataQuality.fx.summary', {
						count: fxSummary.fx_missing_count,
						pct: (fxSummary.coverage_ratio * 100).toFixed(0)
					})}
				</p>
				{#if fxSummary.fx_missing_amount_by_currency.length > 0}
					<ul class="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
						{#each fxSummary.fx_missing_amount_by_currency as row (row.currency)}
							<li class="rounded border border-border px-2 py-1 tabular-nums">
								{row.currency}: {formatMoney(row.amount_minor, row.currency)}
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="mt-3 text-sm text-danger">{t('settings.dataQuality.fx.loadError')}</p>
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">{t('settings.dataQuality.dupes.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('settings.dataQuality.dupes.description')}</p>
			{#if txQuery.isPending}
				<p class="mt-3 text-sm text-text-muted">{t('settings.dataQuality.loading')}</p>
			{:else if duplicates.length === 0}
				<p class="mt-3 text-sm text-success">{t('settings.dataQuality.dupes.clean')}</p>
			{:else}
				<ul class="mt-3 divide-y divide-border">
					{#each duplicates as d (d.key)}
						<li class="flex justify-between gap-2 py-2 text-sm">
							<span class="truncate text-text">
								{d.sample.title}
								<span class="text-text-faint">
									· {t('settings.dataQuality.dupes.count', { count: d.count })}
								</span>
							</span>
							<span class="shrink-0 text-text-muted tabular-nums">
								{formatMoney(d.sample.amount, d.sample.currency)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">{t('settings.dataQuality.duplicatesNav.title')}</h2>
			<p class="mt-0.5 text-xs text-text-muted">{t('settings.dataQuality.duplicatesNav.description')}</p>
			<div class="mt-3 flex flex-wrap gap-3 text-sm">
				<a href="/contacts/duplicates" class="text-brand hover:underline"
					>{t('settings.dataQuality.duplicatesNav.contacts')}</a
				>
				<a href="/patients/duplicates" class="text-brand hover:underline"
					>{t('settings.dataQuality.duplicatesNav.patients')}</a
				>
			</div>
		</section>

		<p class="mt-3 text-xs text-text-faint">
			<a href="/reports" class="text-brand hover:underline">{t('settings.dataQuality.reportsLink')}</a>
		</p>
	{/if}
</div>
