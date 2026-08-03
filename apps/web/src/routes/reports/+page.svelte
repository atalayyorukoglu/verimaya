<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		MarketingReport,
		Patient,
		ReportByCategory,
		ReportByCategoryDetail,
		ReportMonthly,
		ReportSummary,
		SupportedCurrency,
		Tenant,
		Transaction,
		TransactionCreate,
		TransactionUpdate
	} from '@verimaya/shared';
	import {
		marketingReportUrl,
		patientStatusLabels,
		reportUrl,
		transactionKindLabels,
		transactionStatusLabels
	} from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import { USE_MSW } from '$lib/env';
	import { formatDate, formatMoney, formatRatio } from '$lib/format';
	import { amountInBase, isFxMissing, paidAmountInBase } from '$lib/money-base';
	import { transactionStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import TransactionFormDialog from '$lib/components/TransactionFormDialog.svelte';
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
	type PatientsPage = { items: Patient[]; next_cursor: string | null };
	type TabKey = 'ozet' | 'kategori' | 'pazarlama';
	type PeriodKey = 'bu-ay' | 'gecen-ay' | 'tum' | 'ozel';
	type Drill =
		| null
		| { mode: 'category'; label: string }
		| { mode: 'subcategory'; categoryLabel: string; subtitleLabel: string };

	const queryClient = useQueryClient();

	function pad2(n: number) {
		return String(n).padStart(2, '0');
	}

	function isoDay(d: Date) {
		return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
	}

	function monthRange(offsetMonths: number): { from: string; to: string } {
		const now = new Date();
		const first = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
		const last = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0);
		return { from: isoDay(first), to: isoDay(last) };
	}

	function periodLabel(key: PeriodKey, from: string, to: string): string {
		if (key === 'bu-ay') {
			const d = new Date();
			return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(d);
		}
		if (key === 'gecen-ay') {
			const d = new Date();
			d.setMonth(d.getMonth() - 1);
			return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(d);
		}
		if (key === 'tum') return 'Tüm zamanlar';
		return `${from} → ${to}`;
	}

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
	let customFrom = $state(monthRange(0).from);
	let customTo = $state(monthRange(0).to);
	let kindFilter = $state<'all' | 'income' | 'expense'>('all');
	let drill = $state<Drill>(null);

	let txFormOpen = $state(false);
	let editingTx = $state<Transaction | null>(null);
	let txSaving = $state(false);
	let txFormError = $state<string | null>(null);

	const dateRange = $derived.by(() => {
		if (periodKey === 'bu-ay') return monthRange(0);
		if (periodKey === 'gecen-ay') return monthRange(-1);
		if (periodKey === 'ozel') return { from: customFrom, to: customTo };
		return { from: null as string | null, to: null as string | null };
	});

	const periodText = $derived(periodLabel(periodKey, dateRange.from ?? '', dateRange.to ?? ''));

	const txQuery = createQuery(() => ({
		queryKey: ['transactions', { for: 'reports', from: dateRange.from, to: dateRange.to }],
		queryFn: () =>
			apiGet<TxPage>(
				listUrl('transactions', {
					limit: 100,
					from: dateRange.from ?? undefined,
					to: dateRange.to ?? undefined
				})
			)
	}));

	const summaryQuery = createQuery(() => ({
		queryKey: ['reports', 'summary', { from: dateRange.from, to: dateRange.to }],
		queryFn: () =>
			apiGet<ReportSummary>(reportUrl('summary', { from: dateRange.from, to: dateRange.to })),
		enabled: !USE_MSW
	}));

	const byCategoryQuery = createQuery(() => ({
		queryKey: ['reports', 'by-category', { from: dateRange.from, to: dateRange.to }],
		queryFn: () =>
			apiGet<ReportByCategory>(
				reportUrl('by-category', { from: dateRange.from, to: dateRange.to })
			),
		enabled: !USE_MSW
	}));

	const drillCategoryLabel = $derived(drill?.mode === 'category' ? drill.label : null);

	const byCategoryDetailQuery = createQuery(() => ({
		queryKey: [
			'reports',
			'by-category-detail',
			{ from: dateRange.from, to: dateRange.to, category: drillCategoryLabel }
		],
		queryFn: () =>
			apiGet<ReportByCategoryDetail>(
				reportUrl('by-category-detail', {
					from: dateRange.from,
					to: dateRange.to,
					category: drillCategoryLabel
				})
			),
		enabled: !USE_MSW && drillCategoryLabel != null
	}));

	const monthlyRange = $derived.by(() => {
		const now = new Date();
		const from = new Date(now.getFullYear(), now.getMonth() - 5, 1);
		return { from: isoDay(from), to: isoDay(now) };
	});

	const monthlyQuery = createQuery(() => ({
		queryKey: ['reports', 'monthly', monthlyRange],
		queryFn: () => apiGet<ReportMonthly>(reportUrl('monthly', monthlyRange)),
		enabled: !USE_MSW
	}));

	const marketingQuery = createQuery(() => ({
		queryKey: ['reports', 'marketing', { from: dateRange.from, to: dateRange.to }],
		queryFn: () =>
			apiGet<MarketingReport>(marketingReportUrl({ from: dateRange.from, to: dateRange.to }))
	}));

	const tenantQuery = createQuery(() => ({
		queryKey: ['tenants', 'current'],
		queryFn: () => apiGet<Tenant>('/v1/tenants/current')
	}));

	const patientsQuery = createQuery(() => ({
		queryKey: ['patients', { limit: 100, for: 'reports' }],
		queryFn: () => apiGet<PatientsPage>(listUrl('patients', { limit: 100 }))
	}));

	const transactions = $derived(txQuery.data?.items ?? []);
	const patients = $derived(patientsQuery.data?.items ?? []);
	const baseCurrency = $derived((tenantQuery.data?.base_currency ?? 'TRY') as SupportedCurrency);

	const filteredTx = $derived(
		kindFilter === 'all' ? transactions : transactions.filter((t) => t.kind === kindFilter)
	);

	const fxSkipped = $derived(filteredTx.filter((t) => isFxMissing(t, baseCurrency)).length);

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
				pending += base - paid;
			} else {
				expense += base;
			}
		}
		return { income, expense, net: income - expense, pending, count: filteredTx.length };
	});

	const totals = $derived.by(() => {
		if (!USE_MSW && summaryQuery.data) {
			return {
				income: summaryQuery.data.income_base,
				expense: summaryQuery.data.expense_base,
				net: summaryQuery.data.net_base,
				pending: clientTotals.pending,
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

	type ConsistencyIssue = {
		id: string;
		title: string;
		severity: 'warning' | 'error';
		message: string;
	};

	const consistencyIssues = $derived.by(() => {
		const issues: ConsistencyIssue[] = [];
		for (const t of transactions) {
			if (t.kind === 'income' && !t.patient_id) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'warning',
					message: 'Gelir kaydında hasta seçilmemiş.'
				});
			}
			if (t.kind === 'expense' && !t.contact_label?.trim()) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'warning',
					message: 'Gider kaydında kişi/firma etiketi yok.'
				});
			}
			if (!t.category?.trim()) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'warning',
					message: 'Kategori boş.'
				});
			}
			if (t.status === 'paid' && (t.paid_amount == null || t.paid_amount !== t.amount)) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'error',
					message: 'Durum “ödendi” ama ödenen tutar tutarsız veya boş.'
				});
			}
			if (t.status === 'unpaid' && (t.paid_amount ?? 0) > 0) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'error',
					message: 'Durum “ödenmedi” ama paid_amount > 0.'
				});
			}
			if (isFxMissing(t, baseCurrency)) {
				issues.push({
					id: t.id,
					title: t.title,
					severity: 'error',
					message: `Kur karşılığı yok (${t.currency} → ${baseCurrency}). Rapora dahil edilmedi.`
				});
			}
		}
		return issues.slice(0, 12);
	});

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
			patientsQuery.isPending ||
			marketingQuery.isPending ||
			(!USE_MSW && (summaryQuery.isPending || byCategoryQuery.isPending || monthlyQuery.isPending))
	);
	const failed = $derived(
		txQuery.isError ||
			patientsQuery.isError ||
			marketingQuery.isError ||
			(!USE_MSW && (summaryQuery.isError || byCategoryQuery.isError || monthlyQuery.isError)) ||
			(!USE_MSW && drillCategoryLabel != null && byCategoryDetailQuery.isError)
	);

	function setTab(next: TabKey) {
		drill = null;
		const url = new URL(page.url);
		if (next === 'ozet') url.searchParams.delete('tab');
		else url.searchParams.set('tab', next);
		void goto(`${url.pathname}${url.search}`, { replaceState: true, noScroll: true });
	}

	function setPeriod(next: PeriodKey) {
		periodKey = next;
		drill = null;
		if (next === 'ozel') {
			const r = monthRange(0);
			customFrom = r.from;
			customTo = r.to;
		}
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
			await queryClient.invalidateQueries({ queryKey: ['transactions'] });
			await queryClient.invalidateQueries({ queryKey: ['reports'] });
			txFormOpen = false;
			editingTx = null;
		} catch (err) {
			txFormError = err instanceof Error ? err.message : 'Kayıt başarısız';
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
	<title>Raporlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4">
		<PageHeader title="Raporlar" description="Dönem özeti, kategori kırılımı ve gerçek ROAS.">
			{#snippet actions()}
				<div class="flex shrink-0 flex-wrap gap-1.5">
					<Button
						type="button"
						size="sm"
						variant={tab === 'ozet' ? 'default' : 'outline'}
						onclick={() => setTab('ozet')}
					>
						<LayoutGrid class="size-3.5" />
						Özet
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
	<section class="mb-4 rounded-lg border border-border bg-surface p-3 sm:p-4">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-xs font-medium text-text-muted">Dönem</p>
			<p class="text-xs font-semibold text-text">{periodText}</p>
		</div>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each [{ key: 'bu-ay', label: 'Bu ay' }, { key: 'gecen-ay', label: 'Geçen ay' }, { key: 'tum', label: 'Tüm zamanlar' }, { key: 'ozel', label: 'Özel' }] as opt (opt.key)}
				<button
					type="button"
					class="cursor-pointer rounded-[6px] px-2.5 py-1.5 text-xs font-medium transition-colors {periodKey ===
					opt.key
						? 'bg-brand text-primary-foreground'
						: 'bg-surface-2 text-text-muted hover:text-text'}"
					onclick={() => setPeriod(opt.key as PeriodKey)}
				>
					{opt.label}
				</button>
			{/each}
		</div>
		{#if periodKey === 'ozel'}
			<div class="mt-3 grid grid-cols-2 gap-2 sm:max-w-md">
				<label class="grid gap-1 text-xs text-text-muted">
					Başlangıç
					<input
						type="date"
						class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
						bind:value={customFrom}
					/>
				</label>
				<label class="grid gap-1 text-xs text-text-muted">
					Bitiş
					<input
						type="date"
						class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
						bind:value={customTo}
					/>
				</label>
			</div>
		{/if}
	</section>

	{#if loading}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if failed}
		<p class="text-sm text-danger">Rapor verisi yüklenemedi.</p>
	{:else if tab === 'ozet'}
		{#if fxSkipped > 0}
			<div
				class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
			>
				Kur eksik: {fxSkipped} işlem baz para ({baseCurrency}) karşılığı olmadığı için toplamların
				dışında.
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Toplam gelir ({baseCurrency})</p>
				<p class="mt-1 truncate text-lg font-semibold text-success tabular-nums">
					{formatMoney(totals.income, baseCurrency)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Toplam gider ({baseCurrency})</p>
				<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
					{formatMoney(totals.expense, baseCurrency)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Net ({baseCurrency})</p>
				<p
					class="mt-1 truncate text-lg font-semibold tabular-nums {totals.net >= 0
						? 'text-success'
						: 'text-danger'}"
				>
					{formatMoney(totals.net, baseCurrency)}
				</p>
			</div>
			<div class="rounded-lg border border-border bg-surface p-4">
				<p class="text-xs text-text-muted">Bekleyen tahsilat ({baseCurrency})</p>
				<p class="mt-1 truncate text-lg font-semibold text-warning tabular-nums">
					{formatMoney(totals.pending, baseCurrency)}
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

		<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 class="text-sm font-semibold text-text">Tutarlılık uyarıları</h2>
					<p class="mt-0.5 text-xs text-text-muted">
						Kategori / hasta / kişi seçimleri veya ödeme durumu tutarsız görünen işlemler.
					</p>
				</div>
				{#if consistencyIssues.length > 0}
					<span class="rounded-[6px] bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
						{consistencyIssues.length} uyarı
					</span>
				{/if}
			</div>

			{#if consistencyIssues.length === 0}
				<div
					class="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
				>
					Tüm kayıtlar temiz görünüyor.
				</div>
			{:else}
				<ul class="mt-4 divide-y divide-border">
					{#each consistencyIssues as issue (`${issue.id}-${issue.message}`)}
						<li class="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
							<span
								class="mt-0.5 shrink-0 rounded-[6px] px-2 py-0.5 text-[10px] font-semibold uppercase {issue.severity ===
								'error'
									? 'bg-danger/15 text-danger'
									: 'bg-warning/15 text-warning'}"
							>
								{issue.severity === 'error' ? 'Hata' : 'Uyarı'}
							</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm font-medium text-text">{issue.title}</p>
								<p class="mt-0.5 text-sm text-text-muted">{issue.message}</p>
							</div>
							<a href="/finance" class="shrink-0 text-xs font-medium text-brand hover:underline">
								Düzelt
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{:else if tab === 'pazarlama'}
		{@const marketing = marketingQuery.data}
		{#if !marketing}
			<p class="text-sm text-text-muted">Pazarlama raporu yüklenemedi.</p>
		{:else}
			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">Reklam harcaması ({baseCurrency})</p>
					<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
						{formatMoney(marketing.spend_base, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">Tahsilat (dönem) ({baseCurrency})</p>
					<p class="mt-1 truncate text-lg font-semibold text-success tabular-nums">
						{formatMoney(marketing.revenue_base, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">Gerçek ROAS</p>
					<p class="mt-1 truncate text-lg font-semibold text-text tabular-nums">
						{marketing.real_roas == null ? '—' : formatRatio(marketing.real_roas)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-4">
					<p class="text-xs text-text-muted">Hasta başı maliyet</p>
					<p class="mt-1 text-sm font-semibold text-text tabular-nums">
						<span class="text-text-muted">CPL</span>
						{marketing.cost_per_lead == null
							? '—'
							: formatMoney(marketing.cost_per_lead, baseCurrency)}
					</p>
					<p class="mt-0.5 text-sm font-semibold text-text tabular-nums">
						<span class="text-text-muted">CPA</span>
						{marketing.cost_per_closed == null
							? '—'
							: formatMoney(marketing.cost_per_closed, baseCurrency)}
					</p>
				</div>
			</div>

			<p class="mt-3 text-xs text-text-muted">
				Gerçek ROAS = dönem tahsilatı ÷ reklam harcaması. Platform ROAS'tan farklıdır.
			</p>

			<section class="mt-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 class="text-sm font-semibold text-text">Kaynak kırılımı</h2>
					<p class="text-xs text-text-muted">
						{marketing.leads_count} lead · {marketing.closed_count} kapalı
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
									<th class="px-1 pb-2 text-right font-medium">Lead</th>
									<th class="px-1 pb-2 text-right font-medium">Kapalı</th>
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
											{row.closed}
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
					Tür
					<select
						class="h-9 rounded-[6px] border border-border bg-surface-2 px-2 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
						bind:value={kindFilter}
					>
						<option value="all">Tümü</option>
						<option value="income">Gelir</option>
						<option value="expense">Gider</option>
					</select>
				</label>
			</section>

			{#if fxSkipped > 0}
				<div
					class="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
				>
					Kur eksik: {fxSkipped} işlem baz ({baseCurrency}) toplamına dahil edilmedi.
				</div>
			{/if}

			<div class="mb-4 grid grid-cols-3 gap-3">
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">Gelir ({baseCurrency})</p>
					<p class="mt-1 text-base font-semibold text-success tabular-nums sm:text-lg">
						{formatMoney(totals.income, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">Gider ({baseCurrency})</p>
					<p class="mt-1 text-base font-semibold text-text tabular-nums sm:text-lg">
						{formatMoney(totals.expense, baseCurrency)}
					</p>
				</div>
				<div class="rounded-lg border border-border bg-surface p-3 sm:p-4">
					<p class="text-xs text-text-muted">İşlem</p>
					<p class="mt-1 text-base font-semibold text-text tabular-nums sm:text-lg">
						{totals.count}
					</p>
				</div>
			</div>

			<p class="mb-2 text-[10px] font-semibold tracking-wider text-text-faint uppercase">
				Kategori raporu
			</p>
			{#if byCategory.length === 0}
				<p class="text-sm text-text-muted">Bu dönemde işlem yok. Dönemi genişletmeyi dene.</p>
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
									<p class="text-xs text-text-faint">{cat.count} işlem</p>
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
						<p class="text-xs text-text-faint">{categoryHero.count} işlem</p>
					</div>
				</div>
			</div>

			{#if !USE_MSW && byCategoryDetailQuery.isPending}
				<p class="text-sm text-text-muted">Alt kategoriler yükleniyor…</p>
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
								<p class="text-xs text-text-faint">{sub.count} işlem</p>
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
						<p class="text-xs text-text-faint">{subcategoryHero.count} işlem</p>
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
								{#if tx.patient_display_name}
									· {tx.patient_display_name}
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
								Düzenle
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<p class="mt-4 text-xs text-text-faint">
		{#if USE_MSW}
			Demo: dönem filtresi MSW üzerinden; özet/kategori istemcide, pazarlama raporu mock
			endpoint’ten.
		{:else}
			Özet, kategori ve pazarlama toplamları sunucu aggregate endpoint'lerinden gelir; grafik ve
			drill-down için işlem listesi ayrıca yüklenir.
		{/if}
	</p>
</div>

<TransactionFormDialog
	bind:open={txFormOpen}
	transaction={editingTx}
	patients={patientsQuery.data?.items ?? []}
	saving={txSaving}
	error={txFormError}
	onsubmit={saveTransaction}
/>
