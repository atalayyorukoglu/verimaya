<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		MarketingReport,
		ReportAppointmentMetrics,
		ReportByCategory,
		ReportByCategoryDetail,
		ReportConsistency,
		ReportMonthly,
		ReportContactDistribution,
		ReportSummary,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		marketingReportUrl,
		contactStatusLabels,
		reportUrl,
		toTenantDayKey,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { USE_MSW } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatDate, formatMoney, formatPercent, formatRatio } from '$lib/format';
	import { amountInBase, paidAmountInBase } from '$lib/money-base';
	import { transactionStatusTone } from '$lib/status-tone';
	import { resolvePeriodRange, type PeriodKey } from '$lib/period-range';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import PeriodSelector from '$lib/components/PeriodSelector.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
	import ConsistencyIssuesList from '$lib/components/ConsistencyIssuesList.svelte';
	import { Button } from '$lib/components/ui/button';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderTree from '@lucide/svelte/icons/folder-tree';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import Megaphone from '@lucide/svelte/icons/megaphone';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Tag from '@lucide/svelte/icons/tag';

	type TxPage = { items: Transaction[]; next_cursor: string | null };
	type TabKey = 'ozet' | 'kategori' | 'pazarlama';
	type Drill =
		| null
		| { mode: 'category'; label: string }
		| { mode: 'subcategory'; categoryLabel: string; subtitleLabel: string };

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current'),
		enabled: qs.ready
	}));

	const tenantTimezone = $derived(tenantQuery.data?.timezone ?? 'Europe/Istanbul');

	function subtitleKey(s: string | null | undefined): string {
		return (s || 'Genel').trim() || 'Genel';
	}

	function categoryTone(net: number, income: number, expense: number): 'pos' | 'neg' | 'neu' {
		if (net > 0 || (income > 0 && expense === 0)) return 'pos';
		if (net < 0 || (expense > 0 && income === 0)) return 'neg';
		return 'neu';
	}

	const tab = $derived.by((): TabKey => {
		const t = page.url.searchParams.get('tab');
		if (t === 'kategori') return 'kategori';
		if (t === 'pazarlama') return 'pazarlama';
		return 'ozet';
	});

	let periodKey = $state<PeriodKey>('bu-ay');
	let customFrom = $state('');
	let customTo = $state('');
	let kindFilter = $state<'all' | 'income' | 'expense'>('all');
	let drill = $state<Drill>(null);

	$effect(() => {
		void periodKey;
		drill = null;
	});

	let txFormOpen = $state(false);
	let editingTx = $state<Transaction | null>(null);
	let txSaving = $state(false);
	let txFormError = $state<string | null>(null);

	const dateRange = $derived(resolvePeriodRange(periodKey, customFrom, customTo, tenantTimezone));

	const txQuery = createQuery(() => ({
		queryKey: qs.keys.transactions.list({ for: 'reports', from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<TxPage>(
				listUrl('transactions', {
					limit: 100,
					from: dateRange.from ?? undefined,
					to: dateRange.to ?? undefined
				})
			),
		enabled: qs.ready
	}));

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.summary({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportSummary>(reportUrl('summary', { from: dateRange.from, to: dateRange.to })),
		enabled: qs.ready
	}));

	const contactDistributionQuery = createQuery(() => ({
		queryKey: qs.keys.reports.contactDistribution({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportContactDistribution>(
				reportUrl('contact-distribution', { from: dateRange.from, to: dateRange.to })
			),
		enabled: qs.ready
	}));

	const appointmentMetricsQuery = createQuery(() => ({
		queryKey: qs.keys.reports.appointmentMetrics({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportAppointmentMetrics>(
				reportUrl('appointment-metrics', { from: dateRange.from, to: dateRange.to })
			),
		enabled: qs.ready
	}));

	const consistencyQuery = createQuery(() => ({
		queryKey: qs.keys.reports.consistency({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportConsistency>(
				reportUrl('consistency', { from: dateRange.from, to: dateRange.to })
			),
		enabled: qs.ready
	}));

	const byCategoryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.byCategory({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<ReportByCategory>(
				reportUrl('by-category', { from: dateRange.from, to: dateRange.to })
			),
		enabled: !USE_MSW && qs.ready
	}));

	const drillCategoryLabel = $derived(drill?.mode === 'category' ? drill.label : null);

	const byCategoryDetailQuery = createQuery(() => ({
		queryKey: qs.keys.reports.byCategoryDetail({
			from: dateRange.from,
			to: dateRange.to,
			category: drillCategoryLabel
		}),
		queryFn: () =>
			apiGet<ReportByCategoryDetail>(
				reportUrl('by-category-detail', {
					from: dateRange.from,
					to: dateRange.to,
					category: drillCategoryLabel
				})
			),
		enabled: !USE_MSW && drillCategoryLabel != null && qs.ready
	}));

	const monthlyRange = $derived.by(() => {
		const tz = tenantTimezone;
		const to = toTenantDayKey(new Date(), tz);
		const [year, month] = to.split('-').map(Number);
		let fromYear = year;
		let fromMonth = month - 5;
		while (fromMonth < 1) {
			fromMonth += 12;
			fromYear--;
		}
		const from = `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`;
		return { from, to };
	});

	const monthlyQuery = createQuery(() => ({
		queryKey: qs.keys.reports.monthly(monthlyRange),
		queryFn: () => apiGet<ReportMonthly>(reportUrl('monthly', monthlyRange)),
		enabled: !USE_MSW && qs.ready
	}));

	const marketingQuery = createQuery(() => ({
		queryKey: qs.keys.reports.marketing({ from: dateRange.from, to: dateRange.to }),
		queryFn: () =>
			apiGet<MarketingReport>(marketingReportUrl({ from: dateRange.from, to: dateRange.to })),
		enabled: qs.ready
	}));

	const transactions = $derived(txQuery.data?.items ?? []);
	const baseCurrency = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);

	const filteredTx = $derived(
		kindFilter === 'all' ? transactions : transactions.filter((t) => t.kind === kindFilter)
	);

	const fxMissingCount = $derived(summaryQuery.data?.fx_missing_count ?? 0);
	const coverageRatio = $derived(summaryQuery.data?.coverage_ratio ?? 1);
	const fxMissingPct = $derived(Math.round((1 - coverageRatio) * 100));
	const fxHint = $derived(
		fxMissingCount > 0
			? t('reports.fxExcluded', {
					currency: baseCurrency,
					count: fxMissingCount,
					pct: fxMissingPct
				})
			: null
	);

	const clientTotals = $derived.by(() => {
		let income = 0;
		let expense = 0;
		let pending = 0;
		for (const t of filteredTx) {
			const base = amountInBase(t, baseCurrency);
			if (base == null) continue;
			if (t.kind === 'income') {
				income += base;
				const paid = paidAmountInBase(t, baseCurrency) ?? 0;
				pending += Math.max(0, base - paid);
			} else {
				expense += base;
			}
		}
		return { income, expense, net: income - expense, pending, count: filteredTx.length };
	});

	const totals = $derived.by(() => {
		if (summaryQuery.data && kindFilter === 'all') {
			return {
				income: summaryQuery.data.income_base,
				expense: summaryQuery.data.expense_base,
				net: summaryQuery.data.net_base,
				pending: summaryQuery.data.pending_base,
				count: summaryQuery.data.transaction_count
			};
		}
		return clientTotals;
	});

	type MonthBucket = { key: string; label: string; income: number; expense: number };

	function emptyMonthBuckets(): Map<string, MonthBucket> {
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
		return buckets;
	}

	const monthly = $derived.by(() => {
		const buckets = emptyMonthBuckets();

		if (!USE_MSW && monthlyQuery.data) {
			for (const row of monthlyQuery.data.items) {
				const bucket = buckets.get(row.month);
				if (!bucket) continue;
				bucket.income = row.income_base;
				bucket.expense = row.expense_base;
			}
		} else {
			for (const t of transactions) {
				const bucket = buckets.get(t.occurred_on.slice(0, 7));
				if (!bucket) continue;
				const base = amountInBase(t, baseCurrency);
				if (base == null) continue;
				if (t.kind === 'income') bucket.income += base;
				else bucket.expense += base;
			}
		}

		const list = [...buckets.values()];
		const max = Math.max(1, ...list.map((b) => Math.max(b.income, b.expense)));
		return { list, max };
	});

	/** Same 6-bucket skeleton as income/expense chart — avoid wrapping grid-cols-6. */
	const opsMonthly = $derived.by(() => {
		const buckets = new Map<string, { key: string; label: string; count: number }>();
		for (const b of emptyMonthBuckets().values()) {
			buckets.set(b.key, { key: b.key, label: b.label, count: 0 });
		}
		for (const row of appointmentMetricsQuery.data?.monthly ?? []) {
			const bucket = buckets.get(row.month);
			if (bucket) bucket.count = row.count;
		}
		const list = [...buckets.values()];
		const max = Math.max(1, ...list.map((b) => b.count));
		return { list, max };
	});

	const statusDist = $derived.by(() => {
		const distribution = contactDistributionQuery.data;
		if (!distribution || distribution.total === 0) return [];
		return distribution.by_status.map(({ status, count }) => ({
			status,
			count,
			pct: Math.round((count / distribution.total) * 100)
		}));
	});

	const consistencyIssueCount = $derived(
		(consistencyQuery.data?.counts.error ?? 0) + (consistencyQuery.data?.counts.warning ?? 0)
	);

	const clientByCategory = $derived.by(() => {
		const map = new Map<string, { income: number; expense: number; count: number }>();
		for (const t of filteredTx) {
			const base = amountInBase(t, baseCurrency);
			if (base == null) continue;
			const key = (t.category || 'Kategorisiz').trim() || 'Kategorisiz';
			const cur = map.get(key) ?? { income: 0, expense: 0, count: 0 };
			if (t.kind === 'income') cur.income += base;
			else cur.expense += base;
			cur.count += 1;
			map.set(key, cur);
		}
		return [...map.entries()]
			.map(([label, v]) => ({ label, ...v, net: v.income - v.expense }))
			.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
	});

	const byCategory = $derived.by(() => {
		if (!USE_MSW && byCategoryQuery.data) {
			return byCategoryQuery.data.items.map((row) => ({
				label: row.category_name,
				income: row.income_base,
				expense: row.expense_base,
				net: row.net_base,
				count: row.transaction_count
			}));
		}
		return clientByCategory;
	});

	const categoryRows = $derived.by(() => {
		if (!drill || drill.mode !== 'category') return [] as Transaction[];
		const label = drill.label;
		return filteredTx.filter((t) => {
			const cat = (t.category || 'Kategorisiz').trim() || 'Kategorisiz';
			return cat === label;
		});
	});

	const clientBySubtitle = $derived.by(() => {
		const map = new Map<string, { income: number; expense: number; count: number }>();
		for (const t of categoryRows) {
			const base = amountInBase(t, baseCurrency);
			if (base == null) continue;
			const key = subtitleKey(t.subtitle);
			const cur = map.get(key) ?? { income: 0, expense: 0, count: 0 };
			if (t.kind === 'income') cur.income += base;
			else cur.expense += base;
			cur.count += 1;
			map.set(key, cur);
		}
		return [...map.entries()]
			.map(([label, v]) => ({ label, ...v, net: v.income - v.expense }))
			.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
	});

	const bySubtitle = $derived.by(() => {
		if (!USE_MSW && byCategoryDetailQuery.data) {
			return byCategoryDetailQuery.data.items.map((row) => ({
				label: row.subtitle_name,
				income: row.income_base,
				expense: row.expense_base,
				net: row.net_base,
				count: row.transaction_count
			}));
		}
		return clientBySubtitle;
	});

	const categoryHero = $derived.by(() => {
		let income = 0;
		let expense = 0;
		for (const t of categoryRows) {
			const base = amountInBase(t, baseCurrency);
			if (base == null) continue;
			if (t.kind === 'income') income += base;
			else expense += base;
		}
		return { income, expense, net: income - expense, count: categoryRows.length };
	});

	const subcategoryRows = $derived.by(() => {
		if (!drill || drill.mode !== 'subcategory') return [] as Transaction[];
		const categoryLabel = drill.categoryLabel;
		const subtitleLabel = drill.subtitleLabel;
		return filteredTx
			.filter((t) => {
				const cat = (t.category || 'Kategorisiz').trim() || 'Kategorisiz';
				if (cat !== categoryLabel) return false;
				return subtitleKey(t.subtitle) === subtitleLabel;
			})
			.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
	});

	const subcategoryHero = $derived.by(() => {
		let income = 0;
		let expense = 0;
		for (const t of subcategoryRows) {
			const base = amountInBase(t, baseCurrency);
			if (base == null) continue;
			if (t.kind === 'income') income += base;
			else expense += base;
		}
		return { income, expense, net: income - expense, count: subcategoryRows.length };
	});

	const loading = $derived(
		txQuery.isPending ||
			summaryQuery.isPending ||
			contactDistributionQuery.isPending ||
			appointmentMetricsQuery.isPending ||
			consistencyQuery.isPending ||
			marketingQuery.isPending ||
			(!USE_MSW && (byCategoryQuery.isPending || monthlyQuery.isPending))
	);
	const failed = $derived(
		txQuery.isError ||
			summaryQuery.isError ||
			contactDistributionQuery.isError ||
			appointmentMetricsQuery.isError ||
			consistencyQuery.isError ||
			marketingQuery.isError ||
			(!USE_MSW && (byCategoryQuery.isError || monthlyQuery.isError)) ||
			(!USE_MSW && drillCategoryLabel != null && byCategoryDetailQuery.isError)
	);

	function setTab(next: TabKey) {
		drill = null;
		const url = new URL(page.url);
		if (next === 'ozet') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		void goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true });
	}

	function openEditTx(tx: Transaction) {
		editingTx = tx;
		txFormError = null;
		txFormOpen = true;
	}

	async function saveTransaction(data: TransactionCreate | TransactionUpdate) {
		if (!editingTx) return;
		txSaving = true;
		txFormError = null;
		try {
			await apiSend(`/v1/transactions/${editingTx.id}`, 'PATCH', data);
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.reports.all() });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			txSaving = false;
		}
	}

	async function deleteTransaction() {
		if (!editingTx) return;
		txSaving = true;
		txFormError = null;
		try {
			await apiSend(`/v1/transactions/${editingTx.id}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.transactions.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.reports.all() });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : t('finance.deleteFailed');
		} finally {
			txSaving = false;
		}
	}

	function toneClass(tone: 'pos' | 'neg' | 'neu') {
		if (tone === 'pos') return 'text-success';
		if (tone === 'neg') return 'text-danger';
		return 'text-text';
	}

	function toneIcon(tone: 'pos' | 'neg' | 'neu') {
		if (tone === 'pos') return 'bg-success/15 text-success';
		if (tone === 'neg') return 'bg-danger/15 text-danger';
		return 'bg-surface-2 text-text-muted';
	}
</script>

<svelte:head>
	<title>{t('reports.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4">
		<PageHeader title={t('reports.title')} description={t('reports.description')}>
			{#snippet actions()}
				<div class="flex shrink-0 flex-wrap gap-1.5">
					<Button
						type="button"
						size="sm"
						variant={tab === 'ozet' ? 'default' : 'outline'}
						onclick={() => setTab('ozet')}
					>
						<LayoutGrid class="size-3.5" />
						{t('reports.tab.summary')}
					</Button>
					<Button
						type="button"
						size="sm"
						variant={tab === 'kategori' ? 'default' : 'outline'}
						onclick={() => setTab('kategori')}
					>
						<FolderTree class="size-3.5" />
						Kategori
					</Button>
					<Button
						type="button"
						size="sm"
						variant={tab === 'pazarlama' ? 'default' : 'outline'}
						onclick={() => setTab('pazarlama')}
					>
						<Megaphone class="size-3.5" />
						Pazarlama
					</Button>
				</div>
			{/snippet}
		</PageHeader>
	</div>

	<!-- Dönem seçici -->
	<PeriodSelector bind:periodKey bind:customFrom bind:customTo {tenantTimezone} />

	{#if loading}
		<p class="text-sm text-text-muted">{t('reports.loading')}</p>
	{:else if failed}
		<p class="text-sm text-danger">{t('reports.loadError')}</p>
	{:else if tab === 'ozet'}
		{@const ops = appointmentMetricsQuery.data}
		<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<div class="mb-4">
				<h2 class="text-sm font-semibold text-text">{t('reports.ops.title')}</h2>
				<p class="mt-0.5 text-xs text-text-muted">{t('reports.ops.description')}</p>
			</div>
			{#if !ops || ops.total === 0}
				<p class="text-sm text-text-muted">{t('reports.ops.empty')}</p>
			{:else}
				<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.ops.total')}</p>
						<p class="mt-1 text-lg font-semibold text-text tabular-nums">{ops.total}</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.ops.completion')}</p>
						<p class="mt-1 text-lg font-semibold text-success tabular-nums">
							{formatPercent(ops.completion_rate)}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.ops.noShow')}</p>
						<p class="mt-1 text-lg font-semibold text-warning tabular-nums">
							{formatPercent(ops.no_show_rate)}
						</p>
					</div>
					<div class="rounded-lg border border-border bg-surface-2/40 p-3">
						<p class="text-xs text-text-muted">{t('reports.ops.cancellation')}</p>
						<p class="mt-1 text-lg font-semibold text-danger tabular-nums">
							{formatPercent(ops.cancellation_rate)}
						</p>
					</div>
				</div>

				<div class="mt-4 grid gap-4 lg:grid-cols-2">
					<div>
						<h3 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('reports.ops.clinics')}
						</h3>
						<ul class="mt-2 divide-y divide-border">
							{#each ops.by_clinic as row (`${row.clinic_contact_id ?? ''}:${row.clinic_name}`)}
								<li class="flex items-center justify-between gap-2 py-2 text-sm">
									<span class="min-w-0 truncate text-text">{row.clinic_name}</span>
									<span class="shrink-0 text-xs text-text-muted tabular-nums">
										{t('reports.ops.clinicStats', {
											count: row.count,
											pct: formatPercent(row.completion_rate, 0)
										})}
									</span>
								</li>
							{/each}
						</ul>
					</div>
					<div>
						<h3 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
							{t('reports.ops.types')}
						</h3>
						<ul class="mt-2 divide-y divide-border">
							{#each ops.by_appointment_type as row (row.appointment_type)}
								<li class="flex items-center justify-between gap-2 py-2 text-sm">
									<span class="min-w-0 truncate text-text">{row.appointment_type}</span>
									<span class="shrink-0 text-xs text-text-muted tabular-nums">
										{row.count} · {formatPercent(row.ratio, 0)}
									</span>
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<div class="mt-4">
					<h3 class="text-xs font-semibold tracking-wide text-text-muted uppercase">
						{t('reports.ops.monthly')}
					</h3>
					<div class="mt-4 grid grid-cols-6 items-end gap-2 sm:gap-4" style="height: 180px">
						{#each opsMonthly.list as bucket (bucket.key)}
							<div class="flex h-full min-w-0 flex-col justify-end">
								<p class="mb-1 text-center text-[10px] text-text-muted tabular-nums">
									{bucket.count > 0 ? bucket.count : '\u00a0'}
								</p>
								<div class="flex min-h-0 flex-1 items-end justify-center">
									<div
										class="w-3 rounded-t-[3px] bg-brand/80 sm:w-5"
										style="height: {(bucket.count / opsMonthly.max) * 100}%"
										title="{bucket.label}: {bucket.count}"
									></div>
								</div>
								<p class="mt-2 truncate text-center text-xs text-text-muted">{bucket.label}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</section>

		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">
					Toplam gelir ({baseCurrency})
					{#if fxHint}
						<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
					{/if}
				</p>
				<p class="mt-1 truncate text-lg font-semibold text-success tabular-nums">
					{formatMoney(totals.income, baseCurrency)}
				</p>
				{#if fxHint && totals.income === 0 && totals.count > 0}
					<p class="mt-1 text-[11px] text-warning">{fxHint}</p>
				{/if}
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">
					Toplam gider ({baseCurrency})
					{#if fxHint}
						<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
					{/if}
				</p>
				<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
					{formatMoney(totals.expense, baseCurrency)}
				</p>
				{#if fxHint && totals.expense === 0 && totals.count > 0}
					<p class="mt-1 text-[11px] text-warning">{fxHint}</p>
				{/if}
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">
					Net ({baseCurrency})
					{#if fxHint}
						<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
					{/if}
				</p>
				<p
					class="mt-1 truncate text-lg font-semibold tabular-nums {totals.net >= 0
						? 'text-success'
						: 'text-danger'}"
				>
					{formatMoney(totals.net, baseCurrency)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">
					Bekleyen tahsilat ({baseCurrency})
					{#if fxHint}
						<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
					{/if}
				</p>
				<p class="mt-1 truncate text-lg font-semibold text-warning tabular-nums">
					{formatMoney(totals.pending, baseCurrency)}
				</p>
			</div>
		</div>

		<div class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold text-text">{t('reports.monthlyIoE')}</h2>
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
								title="Gelir: {formatMoney(bucket.income, baseCurrency)}"
							></div>
							<div
								class="w-3 rounded-t-[3px] bg-border sm:w-5"
								style="height: {Math.max(2, (bucket.expense / monthly.max) * 100)}%"
								title="Gider: {formatMoney(bucket.expense, baseCurrency)}"
							></div>
						</div>
						<p class="mt-2 truncate text-center text-xs text-text-muted">{bucket.label}</p>
					</div>
				{/each}
			</div>
		</div>

		<div class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<h2 class="text-sm font-semibold text-text">{t('reports.statusDist.title')}</h2>
			{#if statusDist.length === 0}
				<p class="mt-3 text-sm text-text-muted">{t('reports.statusDist.empty')}</p>
			{:else}
				<ul class="mt-4 space-y-3">
					{#each statusDist as row (row.status)}
						<li>
							<div class="flex items-center justify-between gap-2 text-xs">
								<span class="truncate text-text">{contactStatusLabels[row.status]}</span>
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

		<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 class="text-sm font-semibold text-text">{t('reports.consistency.title')}</h2>
					<p class="mt-0.5 text-xs text-text-muted">
						{t('reports.consistency.description')}
					</p>
				</div>
				{#if consistencyIssueCount > 0}
					<span class="rounded-[6px] bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
						{t('reports.consistency.badge', { count: consistencyIssueCount })}
					</span>
				{/if}
			</div>

			{#if consistencyIssueCount === 0}
				<div
					class="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
				>
					{t('reports.consistency.clean')}
				</div>
			{:else if consistencyQuery.data}
				<ConsistencyIssuesList data={consistencyQuery.data} />
			{/if}
		</section>
	{:else if tab === 'pazarlama'}
		{@const marketing = marketingQuery.data}
		{#if !marketing}
			<p class="text-sm text-text-muted">{t('reports.marketing.loadError')}</p>
		{:else}
			{@const metricsMissing = marketing.real_roas == null}
			{@const missingTitleKey = marketing.spend_fx_missing
				? 'reports.marketing.fxMissing'
				: marketing.attribution_missing
					? 'reports.marketing.attributionMissing'
					: 'reports.marketing.noData'}
			{@const missingHintKey = marketing.spend_fx_missing
				? 'reports.marketing.fxMissingHint'
				: marketing.attribution_missing
					? 'reports.marketing.attributionMissingHint'
					: 'reports.marketing.noDataHint'}
			{#if metricsMissing}
				<div
					class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text"
					role="status"
				>
					<p class="font-medium">{t(missingTitleKey)}</p>
					<p class="mt-0.5 text-text-muted">{t(missingHintKey)}</p>
					{#if marketing.attribution_missing && marketing.attribution_coverage != null}
						<p class="mt-0.5 text-text-muted">
							{t('reports.marketing.attributionCoverage', {
								count: marketing.leads_count,
								pct: Math.round(marketing.attribution_coverage * 100)
							})}
						</p>
					{/if}
				</div>
			{/if}
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">
						{t('reports.marketing.spend', { currency: baseCurrency })}
					</p>
					<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
						{#if marketing.spend_fx_missing || marketing.spend_base == null}
							<span class="text-warning">{t('reports.marketing.fxMissing')}</span>
						{:else}
							{formatMoney(marketing.spend_base, baseCurrency)}
						{/if}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">
						{t('reports.marketing.revenue', { currency: baseCurrency })}
					</p>
					<p class="mt-1 truncate text-lg font-semibold text-success tabular-nums">
						{formatMoney(marketing.revenue_base, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">{t('reports.marketing.roas')}</p>
					<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
						{#if metricsMissing}
							<span class="text-warning">{t(missingTitleKey)}</span>
						{:else}
							{formatRatio(marketing.real_roas!)}
						{/if}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">{t('reports.marketing.cplLabel')}</p>
					{#if metricsMissing}
						<p class="mt-1 text-sm font-semibold text-warning">
							{t(missingTitleKey)}
						</p>
					{:else}
						<p class="mt-1 text-sm font-semibold text-text tabular-nums">
							<span class="text-text-muted">CPL</span>
							{marketing.cost_per_lead == null
								? '—'
								: formatMoney(marketing.cost_per_lead, baseCurrency)}
						</p>
						<p class="mt-0.5 text-sm font-semibold text-text tabular-nums">
							<span class="text-text-muted">CPT</span>
							{marketing.cost_per_treated == null
								? '—'
								: formatMoney(marketing.cost_per_treated, baseCurrency)}
						</p>
					{/if}
				</div>
			</div>

			<p class="mt-3 text-xs text-text-muted">
				{t('reports.marketing.footnote')}
			</p>

			<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="text-sm font-semibold text-text">{t('reports.sourceBreakdown')}</h2>
					<p class="text-xs text-text-muted">
						{marketing.leads_count} dosya · {marketing.treated_count} tedavi edilen
					</p>
				</div>

				{#if marketing.by_source.length === 0}
					<p class="mt-4 text-sm text-text-muted">Veri yok.</p>
				{:else}
					<div class="-mx-1 mt-4 overflow-x-auto">
						<table class="w-full min-w-[28rem] text-left text-sm">
							<thead>
								<tr class="border-b border-border text-xs text-text-muted">
									<th class="px-1 pb-2 font-medium">Kaynak</th>
									<th class="px-1 pb-2 text-right font-medium">Dosya</th>
									<th class="px-1 pb-2 text-right font-medium">Tedavi edilen</th>
									<th class="px-1 pb-2 text-right font-medium">Tahsilat</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-border">
								{#each marketing.by_source as row (row.source)}
									<tr>
										<td class="px-1 py-2.5 font-medium text-text">{row.source}</td>
										<td class="px-1 py-2.5 text-right text-text tabular-nums">
											{row.leads}
										</td>
										<td class="px-1 py-2.5 text-right text-text tabular-nums">
											{row.treated}
										</td>
										<td class="px-1 py-2.5 text-right text-text tabular-nums">
											{formatMoney(row.revenue_base, baseCurrency)}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		{/if}
	{:else}
		<!-- Kategori sekmesi -->
		{#if !drill}
			<section class="mb-4 rounded-lg border border-border bg-surface p-3 sm:p-4">
				<label class="grid max-w-xs gap-1 text-xs font-medium text-text-muted">
					{t('reports.kind')}
					<select
						class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
						bind:value={kindFilter}
					>
						<option value="all">{t('reports.kindAll')}</option>
						<option value="income">Gelir</option>
						<option value="expense">Gider</option>
					</select>
				</label>
			</section>

			{#if fxHint && kindFilter === 'all'}
				<p class="mb-3 text-xs text-warning">{fxHint}</p>
			{/if}

			<div class="mb-4 grid grid-cols-3 gap-3">
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">
						Gelir ({baseCurrency})
						{#if fxHint && kindFilter === 'all'}
							<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
						{/if}
					</p>
					<p class="mt-1 text-base font-semibold text-success tabular-nums sm:text-lg">
						{formatMoney(totals.income, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">
						Gider ({baseCurrency})
						{#if fxHint && kindFilter === 'all'}
							<span class="ml-1 cursor-help text-warning" title={fxHint}>*</span>
						{/if}
					</p>
					<p class="mt-1 text-base font-semibold text-text tabular-nums sm:text-lg">
						{formatMoney(totals.expense, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">{t('reports.txLabel')}</p>
					<p class="mt-1 text-base font-semibold text-text tabular-nums sm:text-lg">
						{totals.count}
					</p>
				</div>
			</div>

			<p class="mb-2 text-[10px] font-semibold tracking-wider text-text-faint uppercase">
				Kategori raporu
			</p>
			{#if byCategory.length === 0}
				<p class="text-sm text-text-muted">{t('reports.emptyPeriod')}</p>
			{:else}
				<div class="grid grid-cols-2 gap-3">
					{#each byCategory as cat (cat.label)}
						{@const tone = categoryTone(cat.net, cat.income, cat.expense)}
						<button
							type="button"
							class="cursor-pointer rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2/60"
							onclick={() => (drill = { mode: 'category', label: cat.label })}
						>
							<div class="flex items-start gap-3">
								<span
									class="flex size-10 shrink-0 items-center justify-center rounded-[8px] {toneIcon(
										tone
									)}"
								>
									<Folder class="size-4" />
								</span>
								<div class="min-w-0 flex-1">
									<p class="line-clamp-2 text-sm font-semibold text-text">{cat.label}</p>
									<p class="mt-1 text-lg font-semibold tabular-nums {toneClass(tone)}">
										{formatMoney(cat.net, baseCurrency)}
									</p>
									<p class="text-xs text-text-faint">
										{t('reports.txCount', { count: cat.count })}
									</p>
								</div>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{:else if drill.mode === 'category'}
			{@const catDrill = drill}
			{@const tone = categoryTone(categoryHero.net, categoryHero.income, categoryHero.expense)}
			<button
				type="button"
				class="mb-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface-2"
				onclick={() => (drill = null)}
			>
				<ArrowLeft class="size-4" />
				Kategoriler
			</button>

			<div class="mb-4 rounded-lg border border-border bg-surface p-4">
				<div class="flex items-start gap-3">
					<span
						class="flex size-12 shrink-0 items-center justify-center rounded-[10px] {toneIcon(
							tone
						)}"
					>
						<Folder class="size-5" />
					</span>
					<div class="min-w-0">
						<p class="font-semibold text-text">{catDrill.label}</p>
						<p class="mt-1 text-lg font-semibold tabular-nums {toneClass(tone)}">
							{formatMoney(categoryHero.net, baseCurrency)}
						</p>
						<p class="text-xs text-text-faint">
							{t('reports.txCount', { count: categoryHero.count })}
						</p>
					</div>
				</div>
			</div>

			{#if !USE_MSW && byCategoryDetailQuery.isPending}
				<p class="text-sm text-text-muted">{t('reports.subcatsLoading')}</p>
			{/if}

			<ul class="space-y-2">
				{#each bySubtitle as sub (sub.label)}
					{@const st = categoryTone(sub.net, sub.income, sub.expense)}
					<li>
						<button
							type="button"
							class="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 text-left transition-colors hover:bg-surface-2/60"
							onclick={() =>
								(drill = {
									mode: 'subcategory',
									categoryLabel: catDrill.label,
									subtitleLabel: sub.label
								})}
						>
							<span
								class="flex size-10 shrink-0 items-center justify-center rounded-full bg-info/15 text-info"
							>
								<Tag class="size-4" />
							</span>
							<div class="min-w-0 flex-1">
								<p class="font-medium text-text">{sub.label}</p>
								<p class="text-xs text-text-faint">
									{t('reports.txCount', { count: sub.count })}
								</p>
							</div>
							<span class="text-sm font-semibold tabular-nums {toneClass(st)}">
								{formatMoney(sub.net, baseCurrency)}
							</span>
							<ChevronRight class="size-4 shrink-0 text-text-faint" />
						</button>
					</li>
				{/each}
			</ul>
		{:else if drill.mode === 'subcategory'}
			{@const subDrill = drill}
			{@const tone = categoryTone(
				subcategoryHero.net,
				subcategoryHero.income,
				subcategoryHero.expense
			)}
			<button
				type="button"
				class="mb-4 inline-flex cursor-pointer items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 py-2 text-sm font-medium text-text hover:bg-surface-2"
				onclick={() => (drill = { mode: 'category', label: subDrill.categoryLabel })}
			>
				<ArrowLeft class="size-4" />
				{subDrill.categoryLabel}
			</button>

			<div class="mb-4 rounded-lg border border-border bg-surface p-4">
				<div class="flex items-start gap-3">
					<span
						class="flex size-12 shrink-0 items-center justify-center rounded-[10px] {toneIcon(
							tone
						)}"
					>
						<Tag class="size-5" />
					</span>
					<div class="min-w-0">
						<p class="text-xs text-text-muted">{subDrill.categoryLabel}</p>
						<p class="font-semibold text-text">{subDrill.subtitleLabel}</p>
						<p class="mt-1 text-lg font-semibold tabular-nums {toneClass(tone)}">
							{formatMoney(subcategoryHero.net, baseCurrency)}
						</p>
						<p class="text-xs text-text-faint">
							{t('reports.txCount', { count: subcategoryHero.count })}
						</p>
					</div>
				</div>
			</div>

			<ul class="space-y-2">
				{#each subcategoryRows as tx (tx.id)}
					<li class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-3">
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-text">{tx.title}</p>
							<p class="mt-0.5 text-xs text-text-faint">
								{formatDate(tx.occurred_on)} · {transactionKindLabels[tx.kind]}
								{#if tx.contact_display_name}
									· {tx.contact_display_name}
								{/if}
							</p>
							<div class="mt-1.5">
								<StatusBadge
									label={transactionStatusLabels[tx.status]}
									tone={transactionStatusTone(tx.status)}
								/>
							</div>
						</div>
						<div class="flex shrink-0 flex-col items-end gap-1.5">
							<p
								class="text-sm font-semibold tabular-nums {tx.kind === 'income'
									? 'text-success'
									: 'text-text'}"
							>
								{tx.kind === 'expense' ? '−' : '+'}{formatMoney(tx.amount, tx.currency)}
							</p>
							<Button
								type="button"
								variant="outline"
								size="sm"
								class="h-7 gap-1 px-2 text-xs"
								onclick={() => openEditTx(tx)}
							>
								<Pencil class="size-3" />
								{t('common.edit')}
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<p class="mt-4 text-xs text-text-faint">
		{t('reports.footnote')}
	</p>
</div>

<TransactionFormDialog
	bind:open={txFormOpen}
	transaction={editingTx}
	saving={txSaving}
	error={txFormError}
	onsubmit={saveTransaction}
	ondelete={editingTx ? deleteTransaction : undefined}
/>
