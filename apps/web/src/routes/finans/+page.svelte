<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Patient,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import { transactionKindLabels, transactionStatusLabels } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { formatDate, formatMoney } from '$lib/format';
	import { transactionStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';

	type Page = { items: Transaction[]; next_cursor: string | null };
	type PatientsPage = { items: Patient[]; next_cursor: string | null };

	const queryClient = useQueryClient();

	let formOpen = $state(false);
	let editing = $state<Transaction | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const txQuery = createInfiniteQuery(() => ({
		queryKey: ['transactions'],
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<Page>(listUrl('transactions', { limit: 25, cursor: pageParam })),
		initialPageParam: null as string | null,
		getNextPageParam: (last: Page) => last.next_cursor
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'picker' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

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
				await apiSend(`/v1/transactions/${editing.id}`, 'PATCH', data);
			} else {
				await apiSend('/v1/transactions', 'POST', data);
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
			<Button type="button" onclick={openCreate}>Yeni işlem</Button>
		{/snippet}
	</PageHeader>

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
	{saving}
	error={formError}
	onsubmit={saveTransaction}
/>
