<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { ReportBalances } from '@verimaya/shared';
	import { reportUrl } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney } from '$lib/format';
	import {
		filterBalancesByDirection,
		type BalanceDirectionFilter
	} from '$lib/finance/balance-direction-filter';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';

	const qs = useQueryScope();
	let directionFilter = $state<BalanceDirectionFilter>('all');

	const balancesQuery = createQuery(() => ({
		queryKey: qs.keys.reports.balances(),
		queryFn: () => apiGet<ReportBalances>(reportUrl('balances')),
		enabled: qs.ready
	}));

	const balances = $derived(balancesQuery.data?.items ?? []);
	const filteredBalances = $derived(filterBalancesByDirection(balances, directionFilter));
	const footnoteParts = $derived(
		t('finance.balances.footnote', { contactId: '\u0001' }).split('\u0001')
	);
</script>

<svelte:head>
	<title>{t('finance.balances.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<div class="mb-4">
		<a href="/finance" class="text-sm font-medium text-brand hover:underline"
			>{t('finance.balances.back')}</a
		>
	</div>

	<PageHeader title={t('finance.balances.title')} description={t('finance.balances.description')} />

	<div class="mb-4 flex w-full overflow-hidden rounded-lg border border-border sm:w-fit">
		<button
			type="button"
			class={[
				'min-h-11 min-w-0 flex-1 px-2 text-base leading-tight sm:flex-none sm:px-4',
				directionFilter === 'all' ? 'bg-surface-2 font-medium text-text' : 'text-text-muted'
			]}
			aria-pressed={directionFilter === 'all'}
			onclick={() => (directionFilter = 'all')}
		>
			{t('finance.balances.filterAll')}
		</button>
		<button
			type="button"
			class={[
				'min-h-11 min-w-0 flex-1 border-l border-border px-2 text-base leading-tight sm:flex-none sm:px-4',
				directionFilter === 'payable' ? 'bg-surface-2 font-medium text-text' : 'text-text-muted'
			]}
			aria-pressed={directionFilter === 'payable'}
			onclick={() => (directionFilter = 'payable')}
		>
			{t('finance.balances.filterPayable')}
		</button>
		<button
			type="button"
			class={[
				'min-h-11 min-w-0 flex-1 border-l border-border px-2 text-base leading-tight sm:flex-none sm:px-4',
				directionFilter === 'receivable' ? 'bg-surface-2 font-medium text-text' : 'text-text-muted'
			]}
			aria-pressed={directionFilter === 'receivable'}
			onclick={() => (directionFilter = 'receivable')}
		>
			{t('finance.balances.filterReceivable')}
		</button>
	</div>

	{#if balancesQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.balances.loading')}</p>
	{:else if balancesQuery.isError}
		<p class="text-sm text-danger">{t('finance.balances.loadError')}</p>
	{:else if balances.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">{t('finance.balances.empty')}</p>
		</div>
	{:else if filteredBalances.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">{t('finance.balances.emptyFiltered')}</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each filteredBalances as row (`${row.contact_id}-${row.currency}`)}
				<li class="rounded-lg border border-border bg-surface px-4 py-3">
					<div class="flex min-w-0 items-start gap-3">
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted"
						>
							<ArrowLeftRight class="size-4" />
						</span>
						<div class="min-w-0 flex-1">
							{#if row.open_amount < 0}
								<p class="text-sm text-text">
									<span class="text-text-muted">{t('finance.balances.debtor')}</span>
									<span class="font-medium"> Biz</span>
									<span class="text-text-muted">{t('finance.balances.creditor')}</span>
									<span class="font-medium">{row.contact_label}</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{:else if row.open_amount > 0}
								<p class="text-sm text-text">
									<span class="text-text-muted">{t('finance.balances.debtor')}</span>
									<span class="font-medium"> {row.contact_label}</span>
									<span class="text-text-muted">{t('finance.balances.creditor')}</span>
									<span class="font-medium">Biz</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{/if}
							<p class="mt-1 text-base font-semibold text-text tabular-nums">
								{formatMoney(Math.abs(row.open_amount), row.currency)}
							</p>
							{#if row.collected_amount !== 0}
								<p class="mt-0.5 text-xs text-text-muted tabular-nums">
									{t('finance.balances.collected', {
										amount: formatMoney(Math.abs(row.collected_amount), row.currency)
									})}
								</p>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-xs text-text-faint">
			{footnoteParts[0]}<code class="text-text">contact_id</code>{footnoteParts[1]}
			<a href="/contacts" class="text-brand hover:underline">/contacts</a>.
		</p>
	{/if}
</div>
