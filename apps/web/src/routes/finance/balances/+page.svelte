<script lang="ts">
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { Transaction } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';

	type TxPage = { items: Transaction[]; next_cursor: string | null };

	type BalanceRow = {
		contact: string;
		currency: string;
		/** Positive = contact owes us; negative = we owe contact */
		net: number;
	};

	const txQuery = createInfiniteQuery(() => ({
		queryKey: ['transactions', { for: 'p2p', all: true }],
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<TxPage>(listUrl('transactions', { limit: 100, cursor: pageParam })),
		initialPageParam: null as string | null,
		getNextPageParam: (last: TxPage) => last.next_cursor
	}));

	$effect(() => {
		if (txQuery.hasNextPage && !txQuery.isFetchingNextPage) {
			void txQuery.fetchNextPage();
		}
	});

	const balances = $derived.by(() => {
		const map = new Map<string, number>();
		for (const page of txQuery.data?.pages ?? []) {
			for (const t of page.items) {
				const contact = t.contact_label?.trim();
				if (!contact) continue;
				const key = `${contact}\0${t.currency}`;
				const delta = t.kind === 'income' ? t.amount : -t.amount;
				map.set(key, (map.get(key) ?? 0) + delta);
			}
		}
		const rows: BalanceRow[] = [];
		for (const [key, net] of map) {
			if (net === 0) continue;
			const [contact, currency] = key.split('\0');
			rows.push({ contact, currency, net });
		}
		return rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
	});

	const loadingMore = $derived(txQuery.isFetchingNextPage || txQuery.hasNextPage);
</script>

<svelte:head>
	<title>Bakiyeler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<div class="mb-4">
		<a href="/finance" class="text-sm font-medium text-brand hover:underline">← İşlemler</a>
	</div>

	<PageHeader
		title="P2P net bakiyeler"
		description="Kişi/firma etiketli işlemlerden net borç–alacak. Para birimi bazında; farklı birimler toplanmaz."
	/>

	{#if txQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if txQuery.isError}
		<p class="text-sm text-danger">Bakiyeler yüklenemedi.</p>
	{:else if balances.length === 0 && loadingMore}
		<p class="text-sm text-text-muted">Bakiyeler hesaplanıyor…</p>
	{:else if balances.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">Kişi etiketli işlem yok veya tüm bakiyeler sıfır.</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each balances as row (`${row.contact}-${row.currency}`)}
				<li class="rounded-lg border border-border bg-surface px-4 py-3">
					<div class="flex min-w-0 items-start gap-3">
						<span
							class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text-muted"
						>
							<ArrowLeftRight class="size-4" />
						</span>
						<div class="min-w-0 flex-1">
							{#if row.net < 0}
								<p class="text-sm text-text">
									<span class="text-text-muted">Borçlu</span>
									<span class="font-medium"> Biz</span>
									<span class="text-text-muted"> → alacaklı </span>
									<span class="font-medium">{row.contact}</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{:else}
								<p class="text-sm text-text">
									<span class="text-text-muted">Borçlu</span>
									<span class="font-medium"> {row.contact}</span>
									<span class="text-text-muted"> → alacaklı </span>
									<span class="font-medium">Biz</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{/if}
							<p class="mt-1 text-base font-semibold text-text tabular-nums">
								{formatMoney(Math.abs(row.net), row.currency)}
							</p>
						</div>
					</div>
				</li>
			{/each}
		</ul>

		{#if loadingMore}
			<p class="mt-3 text-xs text-text-faint">Kalan işlemler yükleniyor…</p>
		{/if}

		<p class="mt-4 text-xs text-text-faint">
			Demo: işlemlerdeki <code class="text-text">contact_id</code> /
			<code class="text-text">contact_label</code> alanından hesaplanır. Dizindeki kişiler:
			<a href="/contacts" class="text-brand hover:underline">/contacts</a>.
		</p>
	{/if}
</div>
