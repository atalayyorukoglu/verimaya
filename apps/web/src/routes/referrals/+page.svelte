<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		apiPaths,
		reportUrl,
		type ReportReferrals,
		type SupportedCurrency,
		type Tenant
	} from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { resolvePeriodRange, type PeriodKey } from '$lib/period-range';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodSelector from '$lib/components/PeriodSelector.svelte';

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');
	const baseCurrency = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);

	let periodKey = $state<PeriodKey>('bu-ay');
	let customFrom = $state('');
	let customTo = $state('');

	const dateRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const listQuery = createQuery(() => ({
		queryKey: qs.keys.reports.referrals({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportReferrals>(reportUrl('referrals', { from: dateRange.from, to: dateRange.to })),
		enabled: qs.ready
	}));

	const items = $derived(listQuery.data?.items ?? []);
</script>

<svelte:head>
	<title>{t('reports.referrals.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title={t('reports.referrals.title')}
		description={t('reports.referrals.description')}
	/>

	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('reports.referrals.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('reports.referrals.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('reports.referrals.empty')}</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border bg-surface">
			<table class="w-full min-w-[48rem] text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-text-faint">
						<th class="px-4 py-2.5 font-medium">{t('reports.referrals.colReferrer')}</th>
						<th class="px-4 py-2.5 font-medium">{t('reports.referrals.colCoordinator')}</th>
						<th class="px-4 py-2.5 text-right font-medium">
							{t('reports.referrals.colReferredCount')}
						</th>
						<th class="px-4 py-2.5 text-right font-medium">
							{t('reports.referrals.colWithRevenue')}
						</th>
						<th class="px-4 py-2.5 text-right font-medium">{t('reports.referrals.colIncome')}</th>
						<th class="px-4 py-2.5 text-right font-medium">{t('reports.referrals.colExpense')}</th>
						<th class="px-4 py-2.5 text-right font-medium">{t('reports.referrals.colNet')}</th>
					</tr>
				</thead>
				<tbody>
					{#each items as row (row.referrer_contact_id)}
						<tr class="border-b border-border/60 last:border-0">
							<td class="px-4 py-2.5">
								<a
									href={resolve('/contacts/[id]', { id: row.referrer_contact_id })}
									class="font-medium text-brand hover:underline"
								>
									{row.referrer_display_name}
								</a>
								{#if row.referrer_title_name}
									<p class="text-xs text-text-faint">{row.referrer_title_name}</p>
								{/if}
							</td>
							<td class="px-4 py-2.5 text-text-muted">
								{row.coordinator_name ?? t('reports.referrals.unassignedCoordinator')}
							</td>
							<td class="px-4 py-2.5 text-right text-text tabular-nums">
								{row.referred_count}
							</td>
							<td class="px-4 py-2.5 text-right text-text-muted tabular-nums">
								{row.referred_with_revenue_count}
							</td>
							<td class="px-4 py-2.5 text-right text-success tabular-nums">
								{formatMoney(row.total_income_base, baseCurrency)}
							</td>
							<td class="px-4 py-2.5 text-right text-text tabular-nums">
								{formatMoney(row.total_expense_base, baseCurrency)}
							</td>
							<td
								class="px-4 py-2.5 text-right font-medium tabular-nums {row.total_net_base >= 0
									? 'text-success'
									: 'text-danger'}"
							>
								{formatMoney(row.total_net_base, baseCurrency)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="mt-4 text-xs text-text-faint">{t('reports.referrals.footnote')}</p>
</div>
