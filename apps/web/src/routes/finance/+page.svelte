<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { page } from '$app/state';
	import type {
		ContractResponse,
		InboundMessage,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		apiPaths,
		listUrl,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { formatDate, formatMoney } from '$lib/format';
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

	const patientFilterId = $derived(page.url.searchParams.get('hasta'));

	let formOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const txQuery = createInfiniteQuery(() => ({
		queryKey: ['transactions', { patient_id: patientFilterId }],
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<TransactionsPage>(
				listUrl('transactions', {
					limit: 25,
					cursor: pageParam,
					patient_id: patientFilterId
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: TransactionsPage) => last.next_cursor
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'picker' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

	const filterPatient = $derived(
		patientFilterId ? (patientsQuery.data?.items ?? []).find((p) => p.id === patientFilterId) : null
	);

	const inboxQuery = createQuery(() => ({
		queryKey: ['whatsapp', 'inbox'],
		queryFn: () => apiGet<{ messages: InboundMessage[] }>(apiPaths.whatsappInbox)
	}));

	const pendingCount = $derived(
		(inboxQuery.data?.messages ?? []).filter((m) => m.status === 'new').length
	);

	const items = $derived(txQuery.data?.pages.flatMap((p) => p.items) ?? []);

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
			await queryClient.invalidateQueries({ queryKey: ['transactions'] });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>İşlemler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title="İşlemler" description="Gelir ve gider kayıtları (tutarlar minor unit).">
		{#snippet actions()}
			<div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
				<a
					href="/finance/balances"
					class="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-4 text-sm font-medium text-text hover:bg-surface-2"
				>
					Bakiyeler
				</a>
				<a
					href="/finance/ai-transaction"
					class="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] border border-border bg-transparent px-4 text-sm font-medium text-text hover:bg-surface-2"
				>
					<Sparkles class="size-4" />
					AI ile işlem
					{#if pendingCount > 0}
						<span
							class="rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-text tabular-nums"
						>
							{pendingCount}
						</span>
					{/if}
				</a>
				<Button type="button" class="w-full sm:w-auto" onclick={openCreate}>Yeni işlem</Button>
			</div>
		{/snippet}
	</PageHeader>

	{#if patientFilterId}
		<div
			class="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand-subtle px-3 py-2"
		>
			<p class="text-sm text-text">
				Hasta filtresi:
				<span class="font-medium">{filterPatient?.full_name ?? patientFilterId.slice(0, 8)}</span>
			</p>
			<a
				href="/finance"
				class="inline-flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text"
			>
				<X class="size-3.5" />
				Filtreyi kaldır
			</a>
		</div>
	{/if}

	{#if txQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if txQuery.isError}
		<p class="text-sm text-danger">İşlemler yüklenemedi.</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">İşlem yok.</p>
			<Button class="mt-4" type="button" onclick={openCreate}>Yeni işlem</Button>
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						<th class="w-[14%] px-4 py-3 font-medium">Tarih</th>
						<th class="w-[36%] px-4 py-3 font-medium">Başlık</th>
						<th class="w-[12%] px-4 py-3 font-medium">Tür</th>
						<th class="w-[16%] px-4 py-3 font-medium">Durum</th>
						<th class="w-[22%] px-4 py-3 text-right font-medium">Tutar</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as tx (tx.id)}
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
								{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#each items as tx (tx.id)}
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
							<p
								class="shrink-0 text-sm font-semibold tabular-nums {tx.kind === 'income'
									? 'text-success'
									: 'text-text'}"
							>
								{tx.kind === 'expense' ? '−' : ''}{formatMoney(tx.amount, tx.currency)}
							</p>
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
					{txQuery.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
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
