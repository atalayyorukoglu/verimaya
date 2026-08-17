<script lang="ts">
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type ContactType,
		type ReportUntouchedContacts,
		type UntouchedActivitySource
	} from '@verimaya/shared';
	import { apiGet, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	const qs = useQueryScope();

	/** Panel varsayılanı "Hasta" — ihmal edilen hasta, acentenin en pahalı kaybı. */
	let days = $state(30);
	let contactType = $state('Hasta');

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	function buildUrl(d: number, type: string): string {
		const params = new URLSearchParams({ days: String(d), limit: '100' });
		if (type) params.set('contact_type', type);
		return `/v1/reports/untouched-contacts?${params.toString()}`;
	}

	const listQuery = createQuery(() => ({
		queryKey: qs.keys.reports.untouchedContacts({ days, contact_type: contactType || 'all' }),
		queryFn: () => apiGet<ReportUntouchedContacts>(buildUrl(days, contactType)),
		enabled: qs.ready
	}));

	const data = $derived(listQuery.data);
	const items = $derived(data?.items ?? []);
	const types = $derived(typesQuery.data?.items ?? []);

	function sourceLabel(source: UntouchedActivitySource): string {
		switch (source) {
			case 'appointment':
				return t('reports.untouched.source.appointment');
			case 'transaction':
				return t('reports.untouched.source.transaction');
			case 'case_note':
				return t('reports.untouched.source.case_note');
			default:
				return t('reports.untouched.source.created');
		}
	}

	function sourceTone(source: UntouchedActivitySource): 'info' | 'success' | 'brand' | 'neutral' {
		switch (source) {
			case 'appointment':
				return 'info';
			case 'transaction':
				return 'success';
			case 'case_note':
				return 'brand';
			default:
				return 'neutral';
		}
	}
</script>

<svelte:head>
	<title>{t('reports.untouched.title')} · {t('reports.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/reports')} class="text-sm font-medium text-brand hover:underline">
			← {t('reports.title')}
		</a>
	</div>

	<PageHeader
		title={t('reports.untouched.title')}
		description={t('reports.untouched.description')}
		helpTopic="untouched-contacts"
	/>

	<!-- Kovalar: eşikten bağımsız, tam küme üzerinden sayılır. -->
	<div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
		{#each [{ key: 'd30', label: t('reports.untouched.bucket30'), value: data?.buckets.d30 }, { key: 'd60', label: t('reports.untouched.bucket60'), value: data?.buckets.d60 }, { key: 'd90', label: t('reports.untouched.bucket90'), value: data?.buckets.d90 }] as bucket (bucket.key)}
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-faint">{bucket.label}</p>
				<p class="mt-1 text-2xl font-semibold text-text tabular-nums">
					{bucket.value ?? '—'}
				</p>
			</div>
		{/each}
	</div>

	<div class="mb-4 flex flex-wrap items-end gap-3">
		<div>
			<label class={labelClass} for="untouched-days">
				{t('reports.untouched.thresholdLabel')}
			</label>
			<select id="untouched-days" class="{fieldClass} mt-1 w-auto" bind:value={days}>
				<option value={30}>{t('reports.untouched.threshold30')}</option>
				<option value={60}>{t('reports.untouched.threshold60')}</option>
				<option value={90}>{t('reports.untouched.threshold90')}</option>
			</select>
		</div>
		<div>
			<label class={labelClass} for="untouched-type">{t('reports.untouched.typeLabel')}</label>
			<select id="untouched-type" class="{fieldClass} mt-1 w-auto" bind:value={contactType}>
				<option value="">{t('reports.untouched.typeAll')}</option>
				{#each types as type (type.id)}
					<option value={type.name}>{type.name}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('reports.untouched.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('reports.untouched.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('reports.untouched.empty')}</p>
		</div>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border bg-surface">
			<table class="w-full min-w-[36rem] text-sm">
				<thead>
					<tr class="border-b border-border text-left text-xs text-text-faint">
						<th class="px-4 py-2.5 font-medium">{t('reports.untouched.colName')}</th>
						<th class="px-4 py-2.5 font-medium">{t('reports.untouched.colLastActivity')}</th>
						<th class="px-4 py-2.5 text-right font-medium">
							{t('reports.untouched.colDays')}
						</th>
						<th class="px-4 py-2.5 font-medium">{t('reports.untouched.colContact')}</th>
					</tr>
				</thead>
				<tbody>
					{#each items as row (row.contact_id)}
						<tr class="border-b border-border/60 last:border-0">
							<td class="px-4 py-2.5">
								<a
									href={resolve('/contacts/[id]', { id: row.contact_id })}
									class="font-medium text-brand hover:underline"
								>
									{row.display_name}
								</a>
								<p class="text-xs text-text-faint">{row.contact_type_name}</p>
							</td>
							<td class="px-4 py-2.5">
								<span class="text-text-muted">{formatDate(row.last_activity_at)}</span>
								<span class="mt-1 block">
									<StatusBadge
										label={sourceLabel(row.last_activity_source)}
										tone={sourceTone(row.last_activity_source)}
									/>
								</span>
							</td>
							<td class="px-4 py-2.5 text-right font-medium text-text tabular-nums">
								{row.days_since}
							</td>
							<td class="px-4 py-2.5 text-xs text-text-muted">
								{#if row.phone}<span class="block">{row.phone}</span>{/if}
								{#if row.email}<span class="block">{row.email}</span>{/if}
								{#if !row.phone && !row.email}<span class="text-text-faint">—</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data && data.total > items.length}
			<p class="mt-3 text-xs text-text-faint">
				{t('reports.untouched.capped', {
					shown: String(items.length),
					total: String(data.total)
				})}
			</p>
		{/if}
	{/if}

	<p class="mt-4 text-xs text-text-faint">{t('reports.untouched.futureNote')}</p>
</div>
