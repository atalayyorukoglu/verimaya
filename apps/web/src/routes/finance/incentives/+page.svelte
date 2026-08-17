<script lang="ts">
	import { resolve } from '$app/paths';
	import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		IncentiveFile,
		IncentiveFileCreate,
		IncentiveFileStatus,
		IncentiveFileUpdate
	} from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import IncentiveFileFormDialog from '$lib/components/IncentiveFileFormDialog.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryScope } from '$lib/query-scope.svelte';

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const statusKeys = [
		'open',
		'submitted',
		'approved',
		'rejected',
		'expired'
	] as const satisfies readonly IncentiveFileStatus[];

	const statusMessageKey: Record<IncentiveFileStatus, MessageKey> = {
		open: 'finance.incentives.status.open',
		submitted: 'finance.incentives.status.submitted',
		approved: 'finance.incentives.status.approved',
		rejected: 'finance.incentives.status.rejected',
		expired: 'finance.incentives.status.expired'
	};

	let statusFilter = $state('');
	let dueSoonOnly = $state(false);
	let appliedStatus = $state('');
	let appliedDueSoon = $state(false);

	let formOpen = $state(false);
	let editing = $state<IncentiveFile | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const listParams = $derived({
		status: appliedStatus || undefined,
		due_within_days: appliedDueSoon ? 60 : undefined,
		limit: 25
	});

	const listQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.incentives.list(listParams),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			apiGet<{ items: IncentiveFile[]; next_cursor: string | null }>(
				listUrl('incentives', { ...listParams, cursor: pageParam })
			),
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.next_cursor ?? undefined,
		enabled: qs.ready
	}));

	const items = $derived(listQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function applyFilters(event: SubmitEvent) {
		event.preventDefault();
		appliedStatus = statusFilter;
		appliedDueSoon = dueSoonOnly;
	}

	function openCreate() {
		editing = null;
		formError = null;
		formOpen = true;
	}

	function openEdit(file: IncentiveFile) {
		editing = file;
		formError = null;
		formOpen = true;
	}

	function daysLeftClass(days: number): string {
		if (days < 0) return 'font-semibold text-danger tabular-nums';
		if (days < 60) return 'font-semibold text-warning tabular-nums';
		return 'tabular-nums text-text';
	}

	function docsProgress(file: IncentiveFile): string {
		const total = file.documents.length;
		const done = file.documents.filter((d) => d.done).length;
		return t('finance.incentives.docsProgress', { done: String(done), total: String(total) });
	}

	async function saveFile(data: IncentiveFileCreate | IncentiveFileUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.incentive(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.incentives, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.incentives.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.incentives.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteFile() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.incentive(editing.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.incentives.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('finance.incentives.deleteFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('finance.incentives.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<a href={resolve('/finance')} class="text-sm font-medium text-brand hover:underline"
			>{t('finance.incentives.back')}</a
		>
		<a
			href={resolve('/settings/incentives')}
			class="text-sm font-medium text-text-muted hover:text-text hover:underline"
			>{t('finance.incentives.settingsLink')}</a
		>
	</div>

	<PageHeader
		title={t('finance.incentives.title')}
		description={t('finance.incentives.description')}
	>
		{#snippet actions()}
			<Button type="button" onclick={openCreate}>{t('finance.incentives.new')}</Button>
		{/snippet}
	</PageHeader>

	<form
		class="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
		onsubmit={applyFilters}
	>
		<select
			class="h-11 min-w-0 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none focus:ring-2 focus:ring-brand/40 sm:h-9 sm:w-48 sm:text-sm"
			bind:value={statusFilter}
		>
			<option value="">{t('finance.incentives.filter.statusAll')}</option>
			{#each statusKeys as s (s)}
				<option value={s}>{t(statusMessageKey[s])}</option>
			{/each}
		</select>
		<label class="flex h-11 items-center gap-2 text-sm text-text sm:h-9">
			<input type="checkbox" bind:checked={dueSoonOnly} />
			{t('finance.incentives.filter.dueSoon')}
		</label>
		<Button type="submit" variant="outline">{t('finance.incentives.filter.apply')}</Button>
	</form>

	{#if listQuery.isPending}
		<p class="text-sm text-text-muted">{t('finance.incentives.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('finance.incentives.loadError')}</p>
	{:else if items.length === 0}
		<p class="text-sm text-text-muted">
			{appliedStatus || appliedDueSoon
				? t('finance.incentives.emptyFiltered')
				: t('finance.incentives.empty')}
		</p>
	{:else}
		<div class="overflow-x-auto rounded-lg border border-border">
			<table class="w-full min-w-[40rem] text-left text-sm">
				<thead class="border-b border-border bg-surface-2 text-xs text-text-muted">
					<tr>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.contact')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.paymentDate')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.deadline')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.daysLeft')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.status')}</th>
						<th class="px-3 py-2 font-medium">{t('finance.incentives.col.docs')}</th>
					</tr>
				</thead>
				<tbody>
					{#each items as file (file.id)}
						<tr class="border-b border-border last:border-0 hover:bg-surface-2/60">
							<td class="px-3 py-2">
								<button
									type="button"
									class="font-medium text-brand hover:underline"
									onclick={() => openEdit(file)}
								>
									{file.contact_display_name}
								</button>
							</td>
							<td class="px-3 py-2 text-text tabular-nums">{formatDate(file.payment_date)}</td>
							<td class="px-3 py-2 text-text tabular-nums">{formatDate(file.deadline_at)}</td>
							<td class={`px-3 py-2 ${daysLeftClass(file.days_left)}`}>{file.days_left}</td>
							<td class="px-3 py-2">
								<span
									class="inline-flex rounded-[6px] bg-surface-2 px-2 py-0.5 text-xs font-medium text-text"
								>
									{t(statusMessageKey[file.status])}
								</span>
							</td>
							<td class="px-3 py-2 text-text-muted tabular-nums">{docsProgress(file)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if listQuery.hasNextPage}
			<div class="mt-4">
				<Button
					type="button"
					variant="outline"
					disabled={listQuery.isFetchingNextPage}
					onclick={() => listQuery.fetchNextPage()}
				>
					{listQuery.isFetchingNextPage
						? t('finance.incentives.loading')
						: t('finance.incentives.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<IncentiveFileFormDialog
	bind:open={formOpen}
	file={editing}
	{saving}
	error={formError}
	onsubmit={saveFile}
	ondelete={editing ? deleteFile : undefined}
/>
