<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		reportUrl,
		type InterventionFindingItem,
		type InterventionFindingKind,
		type InterventionLink,
		type InterventionsReport,
		type SupportedCurrency,
		type Tenant
	} from '@verimaya/shared';
	import { apiGet, apiPaths } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney, formatPercent } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { resolvePeriodRange, type PeriodKey } from '$lib/period-range';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodSelector from '$lib/components/PeriodSelector.svelte';
	import CircleCheck from '@lucide/svelte/icons/circle-check';

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
		queryKey: qs.keys.reports.interventions({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<InterventionsReport>(
				reportUrl('interventions', { from: dateRange.from, to: dateRange.to })
			),
		enabled: qs.ready
	}));

	const groups = $derived(listQuery.data?.groups ?? []);
	// Sabit sıra — sunucu yalnız dolu grupları döner, sıra zaten bu; burada ayrıca
	// dizmek gerekmiyor ama görüntü sırası açık olsun diye burada da sabitliyoruz.
	const groupOrder: InterventionFindingKind[] = [
		'quality_drop',
		'revenue_drop',
		'open_incident',
		'referral_value'
	];
	const orderedGroups = $derived(
		[...groups].sort((a, b) => groupOrder.indexOf(a.kind) - groupOrder.indexOf(b.kind))
	);

	/**
	 * Drill-down. Sunucu yalnız üç sabit rota kullanıyor — burada her biri için yol
	 * parametresi / query string ayrımı elle yapılıyor (bkz. `InterventionLink` yorumu,
	 * `report-interventions.ts`).
	 */
	function hrefFor(link: InterventionLink): string {
		const params = link.params ?? {};
		if (link.route === '/contacts/[id]') {
			return resolve('/contacts/[id]', { id: params.id ?? '' });
		}
		const search = new URLSearchParams();
		if (params.tab) search.set('tab', params.tab);
		if (params.from) search.set('from', params.from);
		if (params.to) search.set('to', params.to);
		const base =
			link.route === '/reports/referrals' ? resolve('/reports/referrals') : resolve('/reports');
		const qsStr = search.toString();
		return qsStr ? `${base}?${qsStr}` : base;
	}

	/** Cümle şablon, rakamlar sunucudan geldiği gibi — burada yalnız sayı biçimleniyor. */
	function sentenceFor(item: InterventionFindingItem): string {
		switch (item.kind) {
			case 'quality_drop':
				return t(`reports.interventions.sentence.quality_drop.${item.metric}` as MessageKey, {
					doctor: item.subject_name,
					previous: formatPercent(item.previous),
					current: formatPercent(item.current),
					sampleSize: item.sample_size
				});
			case 'revenue_drop':
				return t(`reports.interventions.sentence.revenue_drop.${item.metric}` as MessageKey, {
					previous: formatMoney(item.previous, baseCurrency),
					current: formatMoney(item.current, baseCurrency)
				});
			case 'open_incident':
				return t('reports.interventions.sentence.openIncident', {
					contact: item.subject_name,
					incidentType: item.incident_type_name,
					daysOpen: item.days_open
				});
			case 'referral_value':
				return t('reports.interventions.sentence.referralValue', {
					referrer: item.subject_name,
					count: item.referred_count,
					amount: formatMoney(item.total_net_base, baseCurrency)
				});
		}
	}

	function coordinatorLine(item: InterventionFindingItem): string | null {
		if (item.kind !== 'referral_value') return null;
		return item.coordinator_name
			? t('reports.interventions.referralCoordinator', { coordinator: item.coordinator_name })
			: t('reports.interventions.referralCoordinatorUnassigned');
	}
</script>

<svelte:head>
	<title>{t('reports.interventions.title')} · {t('reports.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/reports')} class="text-sm font-medium text-brand hover:underline">
			← {t('reports.title')}
		</a>
	</div>

	<PageHeader
		title={t('reports.interventions.title')}
		description={t('reports.interventions.description')}
	/>

	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('reports.interventions.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('reports.interventions.loadError')}</p>
	{:else if orderedGroups.length === 0}
		<div
			class="flex flex-col items-center gap-2 rounded-lg border border-border bg-surface p-8 text-center"
		>
			<CircleCheck class="size-6 text-success" />
			<p class="text-sm text-text-muted">{t('reports.interventions.empty')}</p>
		</div>
	{:else}
		<div class="space-y-5">
			{#each orderedGroups as group (group.kind)}
				<section class="rounded-lg border border-border bg-surface">
					<h2 class="border-b border-border px-4 py-2.5 text-sm font-semibold text-text">
						{t(`reports.interventions.group.${group.kind}` as MessageKey)}
					</h2>
					<ul>
						{#each group.items as item, i (`${item.kind}:${item.subject_id ?? i}:${i}`)}
							<li class="border-b border-border/60 px-4 py-3 last:border-0">
								<a
									href={hrefFor(item.link)}
									class="flex items-start justify-between gap-3 hover:opacity-80"
								>
									<div class="min-w-0">
										<p class="text-sm text-text">{sentenceFor(item)}</p>
										{#if coordinatorLine(item)}
											<p class="mt-0.5 text-xs text-text-faint">{coordinatorLine(item)}</p>
										{/if}
									</div>
									<span class="mt-0.5 shrink-0 text-xs font-medium whitespace-nowrap text-brand">
										{t('reports.interventions.viewLink')}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</section>
			{/each}
		</div>
	{/if}
</div>
