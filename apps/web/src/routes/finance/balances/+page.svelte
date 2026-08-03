<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { ReportBalances } from '@verimaya/shared';
	import { reportUrl } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';

	const { keys, ready } = useQueryScope();

	const balancesQuery = createQuery(() => ({
		queryKey: keys.reports.balances(),
		queryFn: () => apiGet<ReportBalances>(reportUrl('balances')),
		enabled: ready
	}));

	const balances = $derived(balancesQuery.data?.items ?? []);
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

	{#if balancesQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if balancesQuery.isError}
		<p class="text-sm text-danger">Bakiyeler yüklenemedi.</p>
	{:else if balances.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">Kişi etiketli işlem yok veya tüm bakiyeler sıfır.</p>
		</div>
	{:else}
		<ul class="space-y-2">
			{#each balances as row (`${row.contact_id}-${row.currency}`)}
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
									<span class="text-text-muted">Borçlu</span>
									<span class="font-medium"> Biz</span>
									<span class="text-text-muted"> → alacaklı </span>
									<span class="font-medium">{row.contact_label}</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{:else}
								<p class="text-sm text-text">
									<span class="text-text-muted">Borçlu</span>
									<span class="font-medium"> {row.contact_label}</span>
									<span class="text-text-muted"> → alacaklı </span>
									<span class="font-medium">Biz</span>
									<span class="text-text-faint"> ({row.currency})</span>
								</p>
							{/if}
							<p class="mt-1 text-base font-semibold text-text tabular-nums">
								{formatMoney(Math.abs(row.open_amount), row.currency)}
							</p>
							{#if row.collected_amount !== 0}
								<p class="mt-0.5 text-xs text-text-muted tabular-nums">
									Tahsil edilmiş: {formatMoney(Math.abs(row.collected_amount), row.currency)}
								</p>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ul>

		<p class="mt-4 text-xs text-text-faint">
			Bakiyeler <code class="text-text">contact_id</code> + para birimi bazında sunucudan gelir.
			Dizindeki kişiler:
			<a href="/contacts" class="text-brand hover:underline">/contacts</a>.
		</p>
	{/if}
</div>
