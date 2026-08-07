<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import type { ReportSummary, SupportedCurrency, Tenant, Transaction } from '@verimaya/shared';
	import { reportUrl, toTenantDayKey } from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatMoney } from '$lib/format';
	import { isFxMissing } from '$lib/money-base';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';

	type TxPage = { items: Transaction[]; next_cursor: string | null };

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');
	const baseCurrency = $derived(
		(tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency
	);

	function daysAgoIso(days: number): string {
		const d = new Date();
		d.setDate(d.getDate() - days);
		return toTenantDayKey(d, tenantTimezone);
	}

	const from = $derived(daysAgoIso(7));

	const txQuery = createQuery(() => ({
		queryKey: qs.keys.transactions.list({ for: 'data-quality', from }),
		queryFn: () => apiGet<TxPage>(listUrl('transactions', { limit: 100, from })),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.summary({ from, to: null }),
		queryFn: () => apiGet<ReportSummary>(reportUrl('summary', { from })),
		enabled: qs.ready && !!tenantQuery.data
	}));

	const report = $derived.by(() => {
		const items = txQuery.data?.items ?? [];
		let income = 0;
		let expense = 0;
		const missingCategory: Transaction[] = [];
		const missingLink: Transaction[] = [];
		const fxMissing: Transaction[] = [];
		const dupMap = new Map<string, Transaction[]>();

		for (const t of items) {
			if (t.kind === 'income') income += t.amount;
			else expense += t.amount;
			if (!t.category?.trim()) missingCategory.push(t);
			if (t.kind === 'income' && !t.patient_id) missingLink.push(t);
			if (t.kind === 'expense' && !t.contact_label?.trim() && !t.patient_id) missingLink.push(t);
			if (isFxMissing(t, baseCurrency)) fxMissing.push(t);
			const key = `${t.amount}|${t.currency}|${t.occurred_on}|${t.kind}`;
			const bucket = dupMap.get(key) ?? [];
			bucket.push(t);
			dupMap.set(key, bucket);
		}

		const duplicates = [...dupMap.entries()]
			.filter(([, rows]) => rows.length > 1)
			.map(([key, rows]) => ({ key, count: rows.length, sample: rows[0]! }))
			.slice(0, 8);

		return {
			count: items.length,
			income,
			expense,
			missingCategory: missingCategory.slice(0, 8),
			missingLink: missingLink.slice(0, 8),
			fxMissing: fxMissing.slice(0, 12),
			duplicates
		};
	});

	const fxSummary = $derived(summaryQuery.data);
</script>

<svelte:head>
	<title>Veri kalitesi · Ayarlar · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="Veri kalitesi"
		description="Son 7 günlük işlem özeti, eksik alanlar, kur karşılığı ve mükerrer şüphe."
	/>

	{#if txQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if txQuery.isError}
		<p class="text-sm text-danger">Veri yüklenemedi.</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">Kayıt</p>
				<p class="mt-1 text-lg font-semibold text-text tabular-nums">{report.count}</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">Gelir</p>
				<p class="mt-1 text-lg font-semibold text-success tabular-nums">
					{formatMoney(report.income)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">Gider</p>
				<p class="mt-1 text-lg font-semibold text-text tabular-nums">
					{formatMoney(report.expense)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-3">
				<p class="text-xs text-text-muted">Eksik kategori</p>
				<p class="mt-1 text-lg font-semibold text-warning tabular-nums">
					{report.missingCategory.length}
				</p>
			</div>
		</div>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">Kur bilgisi eksik</h2>
			<p class="mt-0.5 text-xs text-text-muted">
				Baz para ({baseCurrency}) karşılığı çözülemeyen işlemler — rapor toplamına dahil edilmez.
			</p>
			{#if summaryQuery.isPending}
				<p class="mt-3 text-sm text-text-muted">Özet yükleniyor…</p>
			{:else if fxSummary && fxSummary.fx_missing_count === 0}
				<p class="mt-3 text-sm text-success">Temiz (coverage {(fxSummary.coverage_ratio * 100).toFixed(0)}%).</p>
			{:else if fxSummary}
				<p class="mt-3 text-sm text-warning">
					{fxSummary.fx_missing_count} işlem · coverage {(fxSummary.coverage_ratio * 100).toFixed(0)}%
				</p>
				{#if fxSummary.fx_missing_amount_by_currency.length > 0}
					<ul class="mt-2 flex flex-wrap gap-2 text-xs text-text-muted">
						{#each fxSummary.fx_missing_amount_by_currency as row (row.currency)}
							<li class="rounded border border-border px-2 py-1 tabular-nums">
								{row.currency}: {formatMoney(row.amount_minor, row.currency)}
							</li>
						{/each}
					</ul>
				{/if}
				{#if report.fxMissing.length === 0}
					<p class="mt-3 text-xs text-text-faint">
						Örnek liste son 100 kayıtta yok; dönem özeti sunucudan.
					</p>
				{:else}
					<ul class="mt-3 divide-y divide-border">
						{#each report.fxMissing as t (t.id)}
							<li class="flex justify-between gap-2 py-2 text-sm">
								<span class="truncate text-text">
									{t.title}
									<span class="text-text-faint"> · {t.currency}</span>
								</span>
								<a
									href="/finance"
									class="shrink-0 text-xs text-brand hover:underline"
									>Düzelt</a
								>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="mt-3 text-sm text-danger">Kur özeti yüklenemedi.</p>
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">Eksik bağlantı</h2>
			<p class="mt-0.5 text-xs text-text-muted">Gelirde hasta yok / giderde kişi veya hasta yok.</p>
			{#if report.missingLink.length === 0}
				<p class="mt-3 text-sm text-success">Temiz.</p>
			{:else}
				<ul class="mt-3 divide-y divide-border">
					{#each report.missingLink as t (t.id)}
						<li class="flex justify-between gap-2 py-2 text-sm">
							<span class="truncate text-text">{t.title}</span>
							<a href="/finance" class="shrink-0 text-xs text-brand hover:underline">Düzelt</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">Mükerrer şüphe</h2>
			<p class="mt-0.5 text-xs text-text-muted">Aynı tutar + tarih + tür + para birimi.</p>
			{#if report.duplicates.length === 0}
				<p class="mt-3 text-sm text-success">Şüphe yok.</p>
			{:else}
				<ul class="mt-3 divide-y divide-border">
					{#each report.duplicates as d (d.key)}
						<li class="flex justify-between gap-2 py-2 text-sm">
							<span class="truncate text-text">
								{d.sample.title}
								<span class="text-text-faint"> · {d.count} kayıt</span>
							</span>
							<span class="shrink-0 text-text-muted tabular-nums">
								{formatMoney(d.sample.amount, d.sample.currency)}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="mt-4 rounded-lg border border-border bg-surface p-4">
			<h2 class="text-sm font-semibold text-text">Kişi / hasta çift kayıt</h2>
			<p class="mt-0.5 text-xs text-text-muted">
				Telefon, e-posta veya ada göre dizin ve hasta mükerrerleri — birleştirme demosu.
			</p>
			<div class="mt-3 flex flex-wrap gap-3 text-sm">
				<a href="/contacts/duplicates" class="text-brand hover:underline">Kişilerde tara →</a>
				<a href="/patients/duplicates" class="text-brand hover:underline">Hastalarda tara →</a>
			</div>
		</section>

		<p class="mt-3 text-xs text-text-faint">
			<a href="/reports" class="text-brand hover:underline">Raporlar → tutarlılık</a> ile örtüşür; ileride
			tek “kalite” yüzeyi olabilir.
		</p>
	{/if}
</div>
