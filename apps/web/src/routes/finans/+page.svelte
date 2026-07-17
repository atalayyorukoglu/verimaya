<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Transaction } from '@verimaya/shared';
	import { transactionKindLabels, transactionStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatDate, formatMoney } from '$lib/format';
	import { transactionStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page = { items: Transaction[]; next_cursor: string | null };

	const txQuery = createQuery(() => ({
		queryKey: ['transactions', { limit: 50 }],
		queryFn: () => apiGet<Page>(listUrl('transactions', { limit: 50 }))
	}));
</script>

<svelte:head>
	<title>İşlemler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
	<PageHeader title="İşlemler" description="Gelir ve gider kayıtları (tutarlar minor unit)." />

	{#if txQuery.isPending}
		<p class="text-text-muted text-sm">Yükleniyor…</p>
	{:else if txQuery.isError}
		<p class="text-danger text-sm">İşlemler yüklenemedi.</p>
	{:else if (txQuery.data?.items.length ?? 0) === 0}
		<div class="border-border bg-surface rounded-lg border p-8 text-center">
			<p class="text-text-muted text-sm">İşlem yok.</p>
		</div>
	{:else}
		<div class="border-border bg-surface hidden overflow-hidden rounded-lg border md:block">
			<table class="w-full text-left text-sm">
				<thead class="border-border bg-surface-2/50 text-text-muted border-b text-xs">
					<tr>
						<th class="px-4 py-3 font-medium">Tarih</th>
						<th class="px-4 py-3 font-medium">Başlık</th>
						<th class="px-4 py-3 font-medium">Tür</th>
						<th class="px-4 py-3 font-medium">Durum</th>
						<th class="px-4 py-3 text-right font-medium">Tutar</th>
					</tr>
				</thead>
				<tbody class="divide-border divide-y">
					{#each txQuery.data?.items ?? [] as tx (tx.id)}
						<tr class="hover:bg-surface-2/60">
							<td class="text-text-muted px-4 py-3 whitespace-nowrap">{formatDate(tx.occurred_on)}</td>
							<td class="px-4 py-3">
								<p class="text-text font-medium">{tx.title}</p>
								<p class="text-text-faint text-xs">{tx.patient_display_name ?? tx.subtitle ?? '—'}</p>
							</td>
							<td class="text-text-muted px-4 py-3">{transactionKindLabels[tx.kind]}</td>
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
			{#each txQuery.data?.items ?? [] as tx (tx.id)}
				<li class="border-border bg-surface rounded-lg border p-4">
					<div class="flex items-start justify-between gap-2">
						<div>
							<p class="text-text text-sm font-medium">{tx.title}</p>
							<p class="text-text-faint text-xs">{formatDate(tx.occurred_on)}</p>
						</div>
						<p
							class="text-sm font-semibold tabular-nums {tx.kind === 'income'
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
				</li>
			{/each}
		</ul>
	{/if}
</div>
