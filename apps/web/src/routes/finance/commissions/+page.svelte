<script lang="ts">
	import { resolve } from '$app/paths';
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		CommissionEntry,
		CommissionEntryCreate,
		CommissionEntryStatus,
		CommissionEntryUpdate,
		CommissionSummary,
		Contact,
		Tenant
	} from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, fieldClass, apiSend } from '$lib/api';
	import CommissionEntryFormDialog from '$lib/components/CommissionEntryFormDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDate, formatMoney } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryScope } from '$lib/query-scope.svelte';

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const statusKeys = [
		'accrued',
		'paid',
		'cancelled'
	] as const satisfies readonly CommissionEntryStatus[];

	const statusMessageKey: Record<CommissionEntryStatus, MessageKey> = {
		accrued: 'finance.commissions.status.accrued',
		paid: 'finance.commissions.status.paid',
		cancelled: 'finance.commissions.status.cancelled'
	};

	let beneficiaryFilter = $state('');
	let statusFilter = $state('');
	let appliedBeneficiary = $state('');
	let appliedStatus = $state('');

	let formOpen = $state(false);
	let editing = $state<CommissionEntry | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let markingId = $state<string | null>(null);

	const listParams = $derived({
		beneficiary_contact_id: appliedBeneficiary || undefined,
		status: (appliedStatus || undefined) as CommissionEntryStatus | undefined,
		limit: 25
	});

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>(apiPaths.tenantsCurrent),
		enabled: qs.ready
	}));

	const baseCurrency = $derived(tenantQuery.data?.base_currency ?? 'TRY');

	const summaryQuery = createQuery(() => ({
		queryKey: qs.keys.reports.commissionSummary(),
		queryFn: () => apiGet<CommissionSummary>(apiPaths.reportsCommissionSummary),
		enabled: qs.ready
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.list({ limit: 100 }),
		queryFn: () =>
			apiGet<{ items: Contact[]; next_cursor: string | null }>(listUrl('contacts', { limit: 100 })),
		enabled: qs.ready
	}));

	const listQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.commissions.list(listParams),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			apiGet<{ items: CommissionEntry[]; next_cursor: string | null }>(
				listUrl('commissions', { ...listParams, cursor: pageParam })
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.next_cursor ?? undefined,
		enabled: qs.ready
	}));

	const items = $derived(listQuery.data?.pages.flatMap((p) => p.items) ?? []);
	const summary = $derived(summaryQuery.data);
	const filtersActive = $derived(Boolean(appliedBeneficiary || appliedStatus));

	function applyFilters(event: SubmitEvent) {
		event.preventDefault();
		appliedBeneficiary = beneficiaryFilter;
		appliedStatus = statusFilter;
	}

	function openCreate() {
		editing = null;
		formError = null;
		formOpen = true;
	}

	function openEdit(entry: CommissionEntry) {
		editing = entry;
		formError = null;
		formOpen = true;
	}

	async function invalidateAll() {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: qs.keys.commissions.all() }),
			queryClient.invalidateQueries({ queryKey: qs.keys.reports.commissionSummary() })
		]);
	}

	async function saveEntry(data: CommissionEntryCreate | CommissionEntryUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.commission(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.commissions, 'POST', data);
			}
			await invalidateAll();
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.commissions.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteEntry() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.commission(editing.id), 'DELETE');
			await invalidateAll();
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.commissions.deleteFailed');
		} finally {
			saving = false;
		}
	}

	async function markPaid(entry: CommissionEntry) {
		markingId = entry.id;
		try {
			await apiSend(apiPaths.commission(entry.id), 'PATCH', { status: 'paid' });
			await invalidateAll();
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.commissions.markPaidFailed');
		} finally {
			markingId = null;
		}
	}
</script>

<svelte:head>
	<title>{t('finance.commissions.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/finance')} class="text-sm font-medium text-brand hover:underline"
			>{t('finance.commissions.back')}</a
		>
	</div>

	<PageHeader
		title={t('finance.commissions.title')}
		description={t('finance.commissions.description')}
	>
		{#snippet actions()}
			<Button type="button" onclick={openCreate}>{t('finance.commissions.new')}</Button>
		{/snippet}
	</PageHeader>

	<section class="mb-8">
		<h2 class="mb-3 text-sm font-semibold text-text">{t('finance.commissions.summaryTitle')}</h2>
		{#if summaryQuery.isPending}
			<p class="text-sm text-text-muted">{t('finance.commissions.loading')}</p>
		{:else if summaryQuery.isError}
			<p class="text-sm text-danger">{t('finance.commissions.loadError')}</p>
		{:else}
			{#if summary && summary.missing_fx_count > 0}
				<p
					class="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-text"
					role="status"
				>
					{t('finance.commissions.missingFx', { count: String(summary.missing_fx_count) })}
				</p>
			{/if}
			{#if !summary?.items.length}
				<p class="text-sm text-text-muted">{t('finance.commissions.summaryEmpty')}</p>
			{:else}
				<div class="overflow-x-auto rounded-lg border border-border">
					<table class="w-full min-w-[40rem] text-left text-sm">
						<thead class="border-b border-border bg-surface-2 text-xs text-text-muted">
							<tr>
								<th class="px-3 py-2 font-medium">{t('finance.commissions.summary.beneficiary')}</th
								>
								<th class="px-3 py-2 font-medium tabular-nums"
									>{t('finance.commissions.summary.accrued')}</th
								>
								<th class="px-3 py-2 font-medium tabular-nums"
									>{t('finance.commissions.summary.paid')}</th
								>
								<th class="px-3 py-2 font-medium tabular-nums"
									>{t('finance.commissions.summary.open')}</th
								>
								<th class="px-3 py-2 font-medium tabular-nums"
									>{t('finance.commissions.summary.entries')}</th
								>
							</tr>
						</thead>
						<tbody>
							{#each summary.items as row (row.beneficiary_contact_id)}
								<tr class="border-b border-border last:border-0">
									<td class="px-3 py-2 text-text">{row.beneficiary_display_name}</td>
									<td class="px-3 py-2 text-text tabular-nums"
										>{formatMoney(row.accrued_base, baseCurrency)}</td
									>
									<td class="px-3 py-2 text-text tabular-nums"
										>{formatMoney(row.paid_base, baseCurrency)}</td
									>
									<td class="px-3 py-2 font-semibold text-brand tabular-nums"
										>{formatMoney(row.open_base, baseCurrency)}</td
									>
									<td class="px-3 py-2 text-text-muted tabular-nums">{row.entry_count}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{/if}
	</section>

	<form
		class="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface-2/40 p-3"
		onsubmit={applyFilters}
	>
		<div class="min-w-[12rem] flex-1">
			<label class="mb-1 block text-xs font-medium text-text-muted" for="commission-filter-ben"
				>{t('finance.commissions.filter.beneficiary')}</label
			>
			<select id="commission-filter-ben" class={fieldClass} bind:value={beneficiaryFilter}>
				<option value="">{t('finance.commissions.filter.beneficiaryAll')}</option>
				{#each contactsQuery.data?.items ?? [] as c (c.id)}
					<option value={c.id}>{c.display_name}</option>
				{/each}
			</select>
		</div>
		<div class="min-w-[10rem]">
			<label class="mb-1 block text-xs font-medium text-text-muted" for="commission-filter-status"
				>{t('finance.commissions.col.status')}</label
			>
			<select id="commission-filter-status" class={fieldClass} bind:value={statusFilter}>
				<option value="">{t('finance.commissions.filter.statusAll')}</option>
				{#each statusKeys as s (s)}
					<option value={s}>{t(statusMessageKey[s])}</option>
				{/each}
			</select>
		</div>
		<Button type="submit" variant="outline">{t('finance.commissions.filter.apply')}</Button>
	</form>

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.commissions.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('finance.commissions.loadError')}</p>
	{:else if items.length === 0}
		<p class="text-sm text-text-muted">
			{filtersActive ? t('finance.commissions.emptyFiltered') : t('finance.commissions.empty')}
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border">
			<table class="w-full min-w-[48rem] text-left text-sm">
				<thead class="border-b border-border bg-surface-2 text-xs text-text-muted">
					<tr>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.beneficiary')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.case')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.amount')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.earnedOn')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.status')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.commissions.col.paidOn')}</th>
						<th class="px-3 py-2 font-medium"></th>
					</tr>
				</thead>
				<tbody>
					{#each items as entry (entry.id)}
						<tr class="border-b border-border last:border-0 hover:bg-surface-2/50">
							<td class="px-3 py-2">
								<button
									type="button"
									class="text-left font-medium text-text hover:underline"
									onclick={() => openEdit(entry)}
								>
									{entry.beneficiary_display_name}
								</button>
							</td>
							<td class="px-3 py-2 text-text-muted"
								>{entry.case_display_name ?? t('finance.commissions.dash')}</td
							>
							<td class="px-3 py-2 text-text tabular-nums"
								>{formatMoney(entry.amount, entry.currency)}</td
							>
							<td class="px-3 py-2 text-text">{formatDate(entry.earned_on)}</td>
							<td class="px-3 py-2 text-text">{t(statusMessageKey[entry.status])}</td>
							<td class="px-3 py-2 text-text-muted"
								>{entry.paid_on ? formatDate(entry.paid_on) : t('finance.commissions.dash')}</td
							>
							<td class="px-3 py-2 text-right">
								{#if entry.status === 'accrued'}
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={markingId === entry.id}
										onclick={() => markPaid(entry)}
									>
										{t('finance.commissions.markPaid')}
									</Button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if listQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					type="button"
					variant="outline"
					disabled={listQuery.isFetchingNextPage}
					onclick={() => listQuery.fetchNextPage()}
				>
					{t('finance.commissions.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<CommissionEntryFormDialog
	bind:open={formOpen}
	entry={editing}
	{saving}
	error={formError}
	onsubmit={saveEntry}
	ondelete={deleteEntry}
/>
