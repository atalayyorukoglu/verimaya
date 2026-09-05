<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { createQuery } from '@tanstack/svelte-query';
	import type { ReportBalanceRow, ReportBalances, SupportedCurrency } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import {
		filterBalancesByDirection,
		type BalanceDirectionFilter
	} from '$lib/finance/balance-direction-filter';
	import { t } from '$lib/i18n/locale.svelte';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	type Props = {
		collapsible?: boolean;
	};

	type CurrencySummary = {
		currency: SupportedCurrency;
		payable: number;
		receivable: number;
	};

	const STORAGE_KEY = 'verimaya:finance-balances-open';
	const CONTENT_ID = 'finance-balances-panel-content';

	let { collapsible = false }: Props = $props();
	let directionFilter = $state<BalanceDirectionFilter>('all');
	let open = $state(false);
	let preferenceReady = $state(false);

	const qs = useQueryScope();
	const balancesQuery = createQuery(() => ({
		queryKey: qs.keys.reports.balances(),
		queryFn: () => apiGet<ReportBalances>(apiPaths.reportsBalances),
		enabled: qs.ready && (!collapsible || (preferenceReady && open))
	}));

	const balances = $derived(balancesQuery.data?.items ?? []);
	const filteredBalances = $derived(filterBalancesByDirection(balances, directionFilter));
	const summaries = $derived(summarizeBalances(balances));
	const footnoteParts = $derived(
		t('finance.balances.footnote', { contactId: '\u0001' }).split('\u0001')
	);

	onMount(() => {
		if (!collapsible) {
			open = true;
			preferenceReady = true;
			return;
		}
		const stored = localStorage.getItem(STORAGE_KEY);
		open = stored === null ? window.matchMedia('(min-width: 768px)').matches : stored === '1';
		preferenceReady = true;
	});

	function summarizeBalances(items: ReportBalanceRow[]): CurrencySummary[] {
		const totals: CurrencySummary[] = [];

		for (const row of items) {
			let summary = totals.find((item) => item.currency === row.currency);
			if (!summary) {
				summary = { currency: row.currency, payable: 0, receivable: 0 };
				totals.push(summary);
			}
			if (row.open_amount < 0) summary.payable += Math.abs(row.open_amount);
			if (row.open_amount > 0) summary.receivable += row.open_amount;
		}

		return totals.sort((a, b) => a.currency.localeCompare(b.currency));
	}

	function toggleOpen() {
		open = !open;
		localStorage.setItem(STORAGE_KEY, open ? '1' : '0');
	}
</script>

{#if collapsible}
	<section class="mb-6 min-w-0 overflow-hidden rounded-lg border border-border bg-surface">
		<div class="min-w-0 p-4">
			<div class="flex min-w-0 items-start gap-3">
				<button
					type="button"
					class="flex min-h-11 min-w-0 flex-1 items-start justify-between gap-3 rounded-[6px] text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
					aria-expanded={open}
					aria-controls={CONTENT_ID}
					aria-label={open ? t('finance.balances.collapse') : t('finance.balances.expand')}
					onclick={toggleOpen}
				>
					<span class="min-w-0">
						<span class="block text-base font-semibold text-text"
							>{t('finance.balances.title')}</span
						>
						<span class="mt-1 block text-sm text-text-muted">
							{t('finance.balances.independent')}
						</span>
					</span>
					<ChevronDown
						class={[
							'mt-0.5 size-5 shrink-0 text-text-muted transition-transform',
							open && 'rotate-180'
						]}
						aria-hidden="true"
					/>
				</button>
				<a
					href={resolve('/finance/balances')}
					class="hidden min-h-11 shrink-0 items-center text-sm font-medium text-brand hover:underline sm:inline-flex"
				>
					{t('finance.balances.fullPage')}
				</a>
			</div>

			{#if !open}
				{#if summaries.length > 0}
					<ul class="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
						{#each summaries as summary (summary.currency)}
							<li class="min-w-0 rounded-md bg-surface-2 px-3 py-2">
								<p class="text-xs font-semibold text-text-muted">{summary.currency}</p>
								<div class="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
									<span class="min-w-0 text-text">
										{t('finance.balances.summaryPayable')}:
										{formatMoney(summary.payable, summary.currency)}
									</span>
									<span class="min-w-0 text-success">
										{t('finance.balances.summaryReceivable')}:
										{formatMoney(summary.receivable, summary.currency)}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{:else if balancesQuery.data}
					<p class="mt-2 text-sm text-text-faint">
						{t('finance.balances.empty')}
					</p>
				{:else if preferenceReady}
					<p class="mt-2 text-sm text-text-faint">
						{t('finance.balances.summaryUnavailable')}
					</p>
				{/if}
				<a
					href={resolve('/finance/balances')}
					class="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline sm:hidden"
				>
					{t('finance.balances.fullPage')}
				</a>
			{/if}
		</div>

		<div id={CONTENT_ID} class="min-w-0 border-t border-border p-4" hidden={!open}>
			{@render BalanceContent()}
		</div>
	</section>
{:else}
	{@render BalanceContent()}
{/if}

<!--
	Snippet `{@render}` ile çağrılır; `<BalanceContent />` bileşen sözdizimidir ve
	Svelte 5.56 bunu `invalid_snippet_arguments` ile reddediyor — Finans sayfası
	hidrasyonda patlıyor, "Yükleniyor…" ekranında kalıyordu.
-->
{#snippet BalanceContent()}
	<div class="mb-4 flex w-full min-w-0 overflow-hidden rounded-lg border border-border sm:w-fit">
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
				<li class="min-w-0 rounded-lg border border-border bg-surface px-4 py-3">
					<div class="flex min-w-0 items-start gap-3">
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted"
						>
							<ArrowLeftRight class="size-4" aria-hidden="true" />
						</span>
						<div class="min-w-0 flex-1">
							{#if row.open_amount < 0}
								<p class="text-sm break-words text-text">
									<span class="text-text-muted">{t('finance.balances.debtor')}</span>
									<span class="font-medium"> {t('finance.balances.self')}</span>
									<span class="text-text-muted">{t('finance.balances.creditor')}</span>
									<span class="font-medium">{row.contact_label}</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{:else if row.open_amount > 0}
								<p class="text-sm break-words text-text">
									<span class="text-text-muted">{t('finance.balances.debtor')}</span>
									<span class="font-medium"> {row.contact_label}</span>
									<span class="text-text-muted">{t('finance.balances.creditor')}</span>
									<span class="font-medium">{t('finance.balances.self')}</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{/if}
							<p class="mt-1 text-base font-semibold text-text tabular-nums">
								{formatMoney(Math.abs(row.open_amount), row.currency)}
							</p>
							{#if row.oldest_open_days !== null}
								<!--
									Yaşlandırma: "ne kadar açık" tek başına eyleme dönük değil.
									90+ gün kırmızı — anlam rengi, tema aksanı değil.
								-->
								<p
									class="mt-1 text-xs font-medium tabular-nums {row.oldest_open_days > 90
										? 'text-danger'
										: row.oldest_open_days > 60
											? 'text-warning'
											: 'text-text-muted'}"
								>
									{t('finance.balances.oldestOpen', { days: row.oldest_open_days })}
								</p>
								{#if row.aging.d90_plus !== 0 && row.aging.d90_plus !== row.open_amount}
									<p class="mt-0.5 text-xs text-text-muted tabular-nums">
										{t('finance.balances.agingOver90', {
											amount: formatMoney(Math.abs(row.aging.d90_plus), row.currency)
										})}
									</p>
								{/if}
							{/if}
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

		<p class="mt-4 text-xs break-words text-text-faint">
			{footnoteParts[0]}<code class="text-text">contact_id</code>{footnoteParts[1]}
			<a href={resolve('/contacts')} class="text-brand hover:underline">/contacts</a>.
		</p>
	{/if}
{/snippet}
