<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type ContactType,
		type ReportCohorts,
		type SupportedCurrency,
		type Tenant
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney, formatPercent, formatRatio } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import { lastMonthsRange, resolvePeriodRange, type PeriodKey } from '$lib/period-range';
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

	/** Varsayılan: son 12 ay (toplu aktarım tek güne yığılmasın diye dar pencere). */
	const initialRange = lastMonthsRange(12, 'Europe/Istanbul');
	let periodKey = $state<PeriodKey>('ozel');
	let customFrom = $state(initialRange.from);
	let customTo = $state(initialRange.to);
	let contactType = $state('');

	const dateRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	function buildUrl(from: string | null, to: string | null, type: string): string {
		const params = new URLSearchParams();
		if (from) params.set('from', from);
		if (to) params.set('to', to);
		if (type) params.set('contact_type', type);
		const q = params.toString();
		return q ? `${apiPaths.reportsCohorts}?${q}` : apiPaths.reportsCohorts;
	}

	const listQuery = createQuery(() => ({
		queryKey: qs.keys.reports.cohorts({
			from: dateRange.from,
			to: dateRange.to,
			contact_type: contactType || 'all'
		}),
		queryFn: () => apiGet<ReportCohorts>(buildUrl(dateRange.from, dateRange.to, contactType)),
		enabled: qs.ready
	}));

	const data = $derived(listQuery.data);
	const items = $derived(data?.items ?? []);
	const types = $derived(typesQuery.data?.items ?? []);

	function matPct(part: number, total: number): string {
		if (total <= 0) return '';
		return ` (${formatPercent(part / total)})`;
	}
</script>

<svelte:head>
	<title>{t('reports.cohorts.title')} · {t('reports.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/reports')} class="text-sm font-medium text-brand hover:underline">
			← {t('reports.title')}
		</a>
	</div>

	<PageHeader title={t('reports.cohorts.title')} description={t('reports.cohorts.description')} />

	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	<div class="mb-4">
		<label class={labelClass} for="cohort-type">{t('reports.cohorts.typeLabel')}</label>
		<select id="cohort-type" class="{fieldClass} mt-1 w-auto" bind:value={contactType}>
			<option value="">{t('reports.cohorts.typeAll')}</option>
			{#each types as type (type.id)}
				<option value={type.name}>{type.name}</option>
			{/each}
		</select>
	</div>

	{#if data && data.missing_fx_count > 0}
		<p class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text">
			{t('reports.cohorts.fxMissing', { count: String(data.missing_fx_count) })}
		</p>
	{/if}

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('reports.cohorts.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('reports.cohorts.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('reports.cohorts.empty')}</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border bg-surface">
			<table class="w-full min-w-[52rem] text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-text-faint">
						<th class="px-3 py-2.5 font-medium">{t('reports.cohorts.colMonth')}</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colContacts')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colTreated')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colSpend')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colCollected')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colRoas')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colM0')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colM1')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colM2')}
						</th>
						<th class="px-3 py-2.5 text-right font-medium">
							{t('reports.cohorts.colM3')}
						</th>
					</tr>
				</thead>
				<tbody>
					{#each items as row (row.cohort_month)}
						<tr class="border-b border-border/60 last:border-0">
							<td class="px-3 py-2.5 font-medium text-text tabular-nums">
								{row.cohort_month}
							</td>
							<td class="px-3 py-2.5 text-right tabular-nums">{row.contacts}</td>
							<td class="px-3 py-2.5 text-right tabular-nums">{row.treated}</td>
							<td class="px-3 py-2.5 text-right tabular-nums">
								{#if row.spend_base == null}
									<span class="text-text-faint" title={t('reports.cohorts.noSpendData')}>—</span>
								{:else}
									{formatMoney(row.spend_base, baseCurrency)}
								{/if}
							</td>
							<td class="px-3 py-2.5 text-right tabular-nums">
								{formatMoney(row.collected_base, baseCurrency)}
							</td>
							<td class="px-3 py-2.5 text-right tabular-nums">
								{row.roas == null ? '—' : formatRatio(row.roas)}
							</td>
							<td class="px-3 py-2.5 text-right text-xs text-text-muted tabular-nums">
								{formatMoney(row.maturation.m0, baseCurrency)}{matPct(
									row.maturation.m0,
									row.collected_base
								)}
							</td>
							<td class="px-3 py-2.5 text-right text-xs text-text-muted tabular-nums">
								{formatMoney(row.maturation.m1, baseCurrency)}{matPct(
									row.maturation.m1,
									row.collected_base
								)}
							</td>
							<td class="px-3 py-2.5 text-right text-xs text-text-muted tabular-nums">
								{formatMoney(row.maturation.m2, baseCurrency)}{matPct(
									row.maturation.m2,
									row.collected_base
								)}
							</td>
							<td class="px-3 py-2.5 text-right text-xs text-text-muted tabular-nums">
								{formatMoney(row.maturation.m3_plus, baseCurrency)}{matPct(
									row.maturation.m3_plus,
									row.collected_base
								)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="mt-4 text-xs text-text-faint">{t('reports.cohorts.attributionNote')}</p>
</div>
