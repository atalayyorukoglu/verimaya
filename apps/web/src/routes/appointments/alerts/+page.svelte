<script lang="ts">
	import { resolve } from '$app/paths';
	import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { OperationAlert, OperationAlertStatus } from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import { useQueryScope } from '$lib/query-scope.svelte';

	const qs = useQueryScope();
	const queryClient = useQueryClient();

	const statusKeys = [
		'due',
		'upcoming',
		'confirmed'
	] as const satisfies readonly OperationAlertStatus[];

	const statusMessageKey: Record<OperationAlertStatus, MessageKey> = {
		due: 'appointments.alerts.status.due',
		upcoming: 'appointments.alerts.status.upcoming',
		confirmed: 'appointments.alerts.status.confirmed'
	};

	const kindMessageKey: Record<OperationAlert['kind'], MessageKey> = {
		flight: 'appointments.alerts.kind.flight',
		transfer: 'appointments.alerts.kind.transfer',
		welcome: 'appointments.alerts.kind.welcome',
		clinic: 'appointments.alerts.kind.clinic'
	};

	let statusFilter = $state('');
	let dueSoonOnly = $state(false);
	let appliedStatus = $state('');
	let appliedDueSoon = $state(false);
	let confirmingId = $state<string | null>(null);
	let confirmError = $state<string | null>(null);

	const listParams = $derived({
		status: (appliedStatus || undefined) as OperationAlertStatus | undefined,
		within_hours: appliedDueSoon ? 48 : undefined,
		limit: 25
	});

	const listQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.operationAlerts.list(listParams),
		queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
			apiGet<{ items: OperationAlert[]; next_cursor: string | null }>(
				listUrl('operation-alerts', { ...listParams, cursor: pageParam })
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

	function hoursLeftClass(hours: number): string {
		if (hours < 0) return 'font-semibold text-danger tabular-nums';
		if (hours < 6) return 'font-semibold text-warning tabular-nums';
		return 'tabular-nums text-text';
	}

	async function confirmAlert(alert: OperationAlert) {
		confirmingId = alert.id;
		confirmError = null;
		try {
			await apiSend(apiPaths.operationAlertConfirm(alert.id), 'PATCH', {});
			await queryClient.invalidateQueries({ queryKey: qs.keys.operationAlerts.all() });
		} catch (err) {
			confirmError = err instanceof Error ? err.message : t('appointments.alerts.confirmFailed');
		} finally {
			confirmingId = null;
		}
	}
</script>

<svelte:head>
	<title>{t('appointments.alerts.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-6xl min-w-0">
	<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
		<a href={resolve('/appointments')} class="text-sm font-medium text-brand hover:underline"
			>{t('appointments.alerts.back')}</a
		>
	</div>

	<PageHeader
		title={t('appointments.alerts.title')}
		description={t('appointments.alerts.description')}
		helpTopic="operation-alerts"
	/>

	<form
		class="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
		onsubmit={applyFilters}
	>
		<select
			class="h-11 min-w-0 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none focus:ring-2 focus:ring-brand/40 sm:h-9 sm:w-48 sm:text-sm"
			bind:value={statusFilter}
		>
			<option value="">{t('appointments.alerts.filter.statusAll')}</option>
			{#each statusKeys as s (s)}
				<option value={s}>{t(statusMessageKey[s])}</option>
			{/each}
		</select>
		<label class="flex h-11 items-center gap-2 text-sm text-text sm:h-9">
			<input type="checkbox" bind:checked={dueSoonOnly} />
			{t('appointments.alerts.filter.dueSoon')}
		</label>
		<Button type="submit" variant="outline">{t('appointments.alerts.filter.apply')}</Button>
	</form>

	{#if confirmError}
		<p class="mb-3 text-sm text-danger">{confirmError}</p>
	{/if}

	{#if listQuery.isLoading}
		<p class="text-sm text-text-muted">{t('appointments.alerts.loading')}</p>
	{:else if listQuery.isError}
		<p class="text-sm text-danger">{t('appointments.alerts.loadError')}</p>
	{:else if items.length === 0}
		<p class="text-sm text-text-muted">
			{appliedStatus || appliedDueSoon
				? t('appointments.alerts.emptyFiltered')
				: t('appointments.alerts.empty')}
		</p>
	{:else}
		<div class="overflow-x-auto rounded-[6px] border border-border">
			<table class="w-full min-w-[40rem] text-left text-sm">
				<thead class="bg-surface-2 text-text-muted">
					<tr>
						<th class="px-3 py-2 font-medium">{t('appointments.alerts.col.contact')}</th>
						<th class="px-3 py-2 font-medium">{t('appointments.alerts.col.appointment')}</th>
						<th class="px-3 py-2 font-medium">{t('appointments.alerts.col.kind')}</th>
						<th class="px-3 py-2 font-medium">{t('appointments.alerts.col.hoursLeft')}</th>
						<th class="px-3 py-2 font-medium">{t('appointments.alerts.col.status')}</th>
						<th class="px-3 py-2 font-medium"></th>
					</tr>
				</thead>
				<tbody>
					{#each items as alert (alert.id)}
						<tr class="border-b border-border last:border-0 hover:bg-surface-2/60">
							<td class="px-3 py-2 font-medium text-text">{alert.contact_display_name}</td>
							<td class="px-3 py-2 text-text tabular-nums"
								>{formatDateTime(alert.appointment_starts_at)}</td
							>
							<td class="px-3 py-2 text-text">{t(kindMessageKey[alert.kind])}</td>
							<td class={`px-3 py-2 ${hoursLeftClass(alert.hours_left)}`}>{alert.hours_left}</td>
							<td class="px-3 py-2">
								<span
									class="inline-flex rounded-[6px] bg-surface-2 px-2 py-0.5 text-xs font-medium text-text"
								>
									{t(statusMessageKey[alert.status])}
								</span>
							</td>
							<td class="px-3 py-2">
								{#if alert.status !== 'confirmed'}
									<Button
										type="button"
										variant="outline"
										disabled={confirmingId === alert.id}
										onclick={() => confirmAlert(alert)}
									>
										{confirmingId === alert.id
											? t('appointments.alerts.confirming')
											: t('appointments.alerts.confirm')}
									</Button>
								{/if}
							</td>
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
						? t('appointments.alerts.loading')
						: t('appointments.alerts.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>
