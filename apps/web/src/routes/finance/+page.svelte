<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import type {
		ContractResponse,
		InboundMessage,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionKind,
		TransactionStatus,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		listUrl,
		transactionKindLabels,
		transactionKindSchema,
		transactionStatusLabels,
		transactionStatusSchema
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDate, formatMoney } from '$lib/format';
	import { amountInBase } from '$lib/money-base';
	import { t } from '$lib/i18n/locale.svelte';
	import { transactionStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import X from '@lucide/svelte/icons/x';

	type TransactionsPage = ContractResponse<'GET /v1/transactions'>;
	type PatientsPage = ContractResponse<'GET /v1/patients'>;

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const patientFilterId = $derived(page.url.searchParams.get('hasta'));

	let qInput = $state('');
	let categoryInput = $state('');
	let appliedQ = $state('');
	let appliedCategory = $state('');
	let kind = $state('');
	let status = $state('');

	let formOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const kindOptions = $derived(transactionKindSchema.options);
	const statusOptions = $derived(transactionStatusSchema.options);

	const listFilters = $derived({
		patient_id: patientFilterId,
		q: appliedQ || undefined,
		kind: (kind || undefined) as TransactionKind | undefined,
		status: (status || undefined) as TransactionStatus | undefined,
		category: appliedCategory || undefined
	});

	const filtersActive = $derived(
		Boolean(appliedQ || appliedCategory || kind || status || patientFilterId)
	);

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const baseCurrency = $derived(
		(tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency
	);

	/** Base equivalent only when txn currency differs and snapshot exists. */
	function baseLine(tx: Transaction): string | null {
		if (tx.currency === baseCurrency) return null;
		const base = amountInBase(tx, baseCurrency);
		if (base == null) return null;
		const sign = tx.kind === 'expense' ? '−' : '';
		return `${sign}${formatMoney(base, baseCurrency)}`;
	}

	const txQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.transactions.list(listFilters),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<TransactionsPage>(
				listUrl('transactions', {
					limit: 25,
					cursor: pageParam,
					patient_id: listFilters.patient_id,
					q: listFilters.q,
					kind: listFilters.kind,
					status: listFilters.status,
					category: listFilters.category
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: TransactionsPage) => last.next_cursor,
		enabled: qs.ready
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: qs.keys.patients.list({ limit: 100, for: 'picker' }),
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 })),
		enabled: qs.ready
	}));

	const filterPatient = $derived(
		patientFilterId ? (patientsQuery.data?.items ?? []).find((p) => p.id === patientFilterId) : null
	);

	const inboxQuery = createQuery(() => ({
		queryKey: qs.keys.whatsapp.inbox(),
		queryFn: () => apiGet<{ messages: InboundMessage[] }>(apiPaths.whatsappInbox),
		enabled: qs.ready
	}));

	const pendingCount = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').length
	);

	const items = $derived(txQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function applyFilters(e: Event) {
		e.preventDefault();
		appliedQ = qInput.trim();
		appliedCategory = categoryInput.trim();
	}

	function clearFilters() {
		qInput = '';
		categoryInput = '';
		appliedQ = '';
		appliedCategory = '';
		kind = '';
		status = '';
	}

	function openCreate() {
		editing = null;
		formOpen = true;
	}

	function openEdit(tx: Transaction) {
		editing = tx;
		formOpen = true;
	}

	async function saveTransaction(data: TransactionCreate | TransactionUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.transaction(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.transactions, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.saveFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('finance.title')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title={t('finance.title')} description={t('finance.description')}>
		{#snippet actions()}
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<a
					href="/finance/balances"
					class="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-4 text-sm font-medium text-text hover:bg-surface-2"
				>
					{t('finance.balances')}
				</a>
				<a
					href="/finance/ai-transaction"
					class="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-4 text-sm font-medium text-text hover:bg-surface-2"
				>
					<Sparkles class="size-4" />
					{t('finance.aiLink')}
					{#if pendingCount > 0}
						<span
							class="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-text tabular-nums"
						>
							{pendingCount}
						</span>
					{/if}
				</a>
				<Button type="button" class="w-full sm:w-auto" onclick={openCreate}
					>{t('finance.new')}</Button
				>
			</div>
		{/snippet}
	</PageHeader>

	{#if patientFilterId}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-subtle px-3 py-2"
		>
			<p class="text-sm text-text">
				{t('finance.filter.patient')}
				<span class="font-medium">{filterPatient?.full_name ?? patientFilterId.slice(0, 8)}</span>
			</p>
			<a
				href="/finance"
				class="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
			>
				<X class="size-3.5" />
				{t('finance.filter.clearPatient')}
			</a>
		</div>
	{/if}

	<form
		class="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center"
		onsubmit={applyFilters}
	>
		<input
			class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:min-w-[12rem]"
			placeholder={t('finance.filter.qPlaceholder')}
			bind:value={qInput}
		/>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 lg:w-40"
			bind:value={kind}
		>
			<option value="">{t('finance.filter.kindAll')}</option>
			{#each kindOptions as k (k)}
				<option value={k}>{transactionKindLabels[k]}</option>
			{/each}
		</select>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 lg:w-40"
			bind:value={status}
		>
			<option value="">{t('finance.filter.statusAll')}</option>
			{#each statusOptions as s (s)}
				<option value={s}>{transactionStatusLabels[s]}</option>
			{/each}
		</select>
		<input
			class="h-9 min-w-0 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:w-44"
			placeholder={t('finance.filter.categoryPlaceholder')}
			bind:value={categoryInput}
		/>
		<div class="flex gap-2">
			<Button type="submit" variant="secondary">{t('finance.filter.apply')}</Button>
			{#if appliedQ || appliedCategory || kind || status}
				<Button type="button" variant="outline" onclick={clearFilters}
					>{t('finance.filter.clear')}</Button
				>
			{/if}
		</div>
	</form>

	{#if txQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.loading')}</p>
	{:else if txQuery.isError}
		<p class="text-sm text-danger">{t('finance.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">
				{filtersActive ? t('finance.emptyFiltered') : t('finance.empty')}
			</p>
			{#if !filtersActive}
				<Button class="mt-4" type="button" onclick={openCreate}>{t('finance.new')}</Button>
			{/if}
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="w-[14%] px-4 py-3 font-medium">{t('finance.col.date')}</th>
						<th class="w-[36%] px-4 py-3 font-medium">{t('finance.col.title')}</th>
						<th class="w-[12%] px-4 py-3 font-medium">{t('finance.col.kind')}</th>
						<th class="w-[16%] px-4 py-3 font-medium">{t('finance.col.status')}</th>
						<th class="w-[22%] px-4 py-3 text-right font-medium">{t('finance.col.amount')}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as tx (tx.id)}
						{@const baseAmt = baseLine(tx)}
						<tr
							class="cursor-pointer transition-colors hover:bg-surface-2/60"
							onclick={() => openEdit(tx)}
						>
							<td class="px-4 py-3 whitespace-nowrap text-text-muted"
								>{formatDate(tx.occurred_on)}</td
							>
							<td class="min-w-0 px-4 py-3">
								<p class="truncate font-medium text-text">{tx.title}</p>
								<p class="truncate text-xs text-text-faint">
									{tx.patient_display_name ?? tx.subtitle ?? '—'}
								</p>
							</td>
							<td class="px-4 py-3 text-text-muted">{transactionKindLabels[tx.kind]}</td>
							<td class="px-4 py-3">
								<StatusBadge
									label={transactionStatusLabels[tx.status]}
									tone={transactionStatusTone(tx.status)}
								/>
							</td>
							<td
								class="px-4 py-3 text-right font-medium tabular-nums {tx.kind === 'income'
									? 'text-success'
									: 'text-text'}"
							>
								<p>
									{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
								</p>
								{#if baseAmt}
									<p class="text-xs font-normal text-text-faint">{baseAmt}</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#each items as tx (tx.id)}
				{@const baseAmt = baseLine(tx)}
				<li class="min-w-0">
					<button
						type="button"
						class="w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-4 text-left"
						onclick={() => openEdit(tx)}
					>
						<div class="flex min-w-0 items-start justify-between gap-2">
							<div class="min-w-0 flex-1 overflow-hidden">
								<p class="truncate text-sm font-medium text-text">{tx.title}</p>
								<p class="text-xs text-text-faint">{formatDate(tx.occurred_on)}</p>
							</div>
							<div class="shrink-0 text-right">
								<p
									class="text-sm font-semibold tabular-nums {tx.kind === 'income'
										? 'text-success'
										: 'text-text'}"
								>
									{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
								</p>
								{#if baseAmt}
									<p class="text-xs text-text-faint tabular-nums">{baseAmt}</p>
								{/if}
							</div>
						</div>
						<div class="mt-2">
							<StatusBadge
								label={transactionStatusLabels[tx.status]}
								tone={transactionStatusTone(tx.status)}
							/>
						</div>
					</button>
				</li>
			{/each}
		</ul>

		{#if txQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={txQuery.isFetchingNextPage}
					onclick={() => txQuery.fetchNextPage()}
				>
					{txQuery.isFetchingNextPage ? t('finance.loadingMore') : t('finance.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<TransactionFormDialog
	bind:open={formOpen}
	transaction={editing}
	patients={patientsQuery.data?.items ?? []}
	defaultPatientId={patientFilterId}
	{saving}
	error={formError}
	onsubmit={saveTransaction}
/>
