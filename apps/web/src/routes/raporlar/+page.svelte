<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { Patient, Transaction } from '@verimaya/shared';
	import { patientStatusLabels } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { formatMoney } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';

	type TxPage = { items: Transaction[]; next_cursor: string | null };
	type PatientsPage = { items: Patient[]; next_cursor: string | null };

	const txQuery = createQuery(() => ({
		queryKey: ['transactions', { limit: 100, for: 'reports' }],
		queryFn: () => apiGet<TxPage>(listUrl('transactions', { limit: 100 }))
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'reports' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

	const transactions = $derived(txQuery.data?.items ?? []);
	const patients = $derived(patientsQuery.data?.items ?? []);

	const totals = $derived.by(() => {
		let income = 0;
		let expense = 0;
		let pending = 0;
		for (const t of transactions) {
			if (t.kind === 'income') {
				income += t.amount;
				pending += t.amount - (t.paid_amount ?? 0);
			} else {
				expense += t.amount;
			}
		}
		return { income, expense, net: income - expense, pending };
	});

	type MonthBucket = { key: string; label: string; income: number; expense: number };

	const monthly = $derived.by(() => {
		const buckets = new Map<string, MonthBucket>();
		const now = new Date();
		for (let i = 5; i >= 0; i--) {
			const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
			buckets.set(key, {
				key,
				label: new Intl.DateTimeFormat('tr-TR', { month: 'short' }).format(d),
				income: 0,
				expense: 0
			});
		}
		for (const t of transactions) {
			const bucket = buckets.get(t.occurred_on.slice(0, 7));
			if (!bucket) continue;
			if (t.kind === 'income') bucket.income += t.amount;
			else bucket.expense += t.amount;
		}
		const list = [...buckets.values()];
		const max = Math.max(1, ...list.map((b) => Math.max(b.income, b.expense)));
		return { list, max };
	});

	const statusDist = $derived.by(() => {
		const counts = new Map<Patient['status'], number>();
		for (const p of patients) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
		const total = patients.length || 1;
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([status, count]) => ({ status, count, pct: Math.round((count / total) * 100) }));
	});

	const sourceDist = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const p of patients) {
			const key = p.source ?? 'Bilinmiyor';
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
		const max = Math.max(1, ...counts.values());
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([source, count]) => ({ source, count, pct: Math.round((count / max) * 100) }));
	});

	const loading = $derived(txQuery.isPending || patientsQuery.isPending);
	const failed = $derived(txQuery.isError || patientsQuery.isError);
</script>

<svelte:head>
	<title>Raporlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader
		title="Raporlar"
		description="Gelir/gider özeti ve hasta dağılımları (demo veri, son kayıtlar üzerinden)."
	/>

	{#if loading}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if failed}
		<p class="text-sm text-danger">Rapor verisi yüklenemedi.</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Toplam gelir</p>
				<p class="mt-1 truncate text-lg font-semibold text-success tabular-nums">
					{formatMoney(totals.income)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Toplam gider</p>
				<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
					{formatMoney(totals.expense)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Net</p>
				<p
					class="mt-1 truncate text-lg font-semibold tabular-nums {totals.net >= 0
						? 'text-success'
						: 'text-danger'}"
				>
					{formatMoney(totals.net)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Bekleyen tahsilat</p>
				<p class="mt-1 truncate text-lg font-semibold text-warning tabular-nums">
					{formatMoney(totals.pending)}
				</p>
			</div>
		</div>

		<div class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">Aylık gelir / gider</h2>
				<div class="flex items-center gap-3 text-xs text-text-muted">
					<span class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-success"></span> Gelir
					</span>
					<span class="flex items-center gap-1.5">
						<span class="inline-block size-2 rounded-full bg-border"></span> Gider
					</span>
				</div>
			</div>
			<div class="mt-4 grid grid-cols-6 items-end gap-2 sm:gap-4" style="height: 180px">
				{#each monthly.list as bucket (bucket.key)}
					<div class="flex h-full min-w-0 flex-col justify-end">
						<div class="flex h-full items-end justify-center gap-1">
							<div
								class="w-3 rounded-t-[3px] bg-success/80 sm:w-5"
								style="height: {Math.max(2, (bucket.income / monthly.max) * 100)}%"
								title="Gelir: {formatMoney(bucket.income)}"
							></div>
							<div
								class="w-3 rounded-t-[3px] bg-border sm:w-5"
								style="height: {Math.max(2, (bucket.expense / monthly.max) * 100)}%"
								title="Gider: {formatMoney(bucket.expense)}"
							></div>
						</div>
						<p class="mt-2 truncate text-center text-xs text-text-muted">{bucket.label}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="mt-4 grid gap-4 lg:grid-cols-2">
			<div class="rounded-lg border border-border bg-surface p-4 sm:p-6">
				<h2 class="text-sm font-semibold text-text">Hasta durum dağılımı</h2>
				{#if statusDist.length === 0}
					<p class="mt-3 text-sm text-text-muted">Hasta kaydı yok.</p>
				{:else}
					<ul class="mt-4 space-y-3">
						{#each statusDist as row (row.status)}
							<li>
								<div class="flex items-center justify-between gap-2 text-xs">
									<span class="truncate text-text">{patientStatusLabels[row.status]}</span>
									<span class="shrink-0 text-text-muted tabular-nums">
										{row.count} · %{row.pct}
									</span>
								</div>
								<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
									<div class="h-full rounded-full bg-brand" style="width: {row.pct}%"></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-6">
				<h2 class="text-sm font-semibold text-text">Kaynak dağılımı</h2>
				{#if sourceDist.length === 0}
					<p class="mt-3 text-sm text-text-muted">Hasta kaydı yok.</p>
				{:else}
					<ul class="mt-4 space-y-3">
						{#each sourceDist as row (row.source)}
							<li>
								<div class="flex items-center justify-between gap-2 text-xs">
									<span class="truncate text-text">{row.source}</span>
									<span class="shrink-0 text-text-muted tabular-nums">{row.count}</span>
								</div>
								<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
									<div class="h-full rounded-full bg-info" style="width: {row.pct}%"></div>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<p class="mt-4 text-xs text-text-faint">
			Demo modunda rapor, yüklü son 100 işlem ve 100 hasta üzerinden hesaplanır. Gerçek raporlama
			Faz 4'te sunucu tarafında yapılacak.
		</p>
	{/if}
</div>
