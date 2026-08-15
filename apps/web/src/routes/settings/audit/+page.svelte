<script lang="ts">
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { AuditAction, AuditEntity, AuditLog, ContractResponse } from '@verimaya/shared';
	import {
		auditActionLabels,
		auditActionSchema,
		auditEntityLabels,
		auditEntitySchema
	} from '@verimaya/shared';
	import { apiGet, listUrl } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type AuditLogsPage = ContractResponse<'GET /v1/audit-logs'>;

	const qs = useQueryScope();

	let action = $state('');
	let entityType = $state('');
	let actorInput = $state('');
	let qInput = $state('');
	let fromInput = $state('');
	let toInput = $state('');
	let appliedActor = $state('');
	let appliedQ = $state('');
	let appliedFrom = $state('');
	let appliedTo = $state('');

	const actionOptions = $derived(auditActionSchema.options);
	const entityOptions = $derived(auditEntitySchema.options);

	const listFilters = $derived({
		action: (action || undefined) as AuditAction | undefined,
		entity_type: (entityType || undefined) as AuditEntity | undefined,
		actor_id: appliedActor || undefined,
		q: appliedQ || undefined,
		created_from: appliedFrom || undefined,
		created_to: appliedTo || undefined
	});

	const filtersActive = $derived(
		Boolean(action || entityType || appliedActor || appliedQ || appliedFrom || appliedTo)
	);

	const logsQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.auditLogs.list(listFilters),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<AuditLogsPage>(
				listUrl('audit-logs', {
					limit: 25,
					cursor: pageParam,
					action: listFilters.action,
					entity_type: listFilters.entity_type,
					actor_id: listFilters.actor_id,
					q: listFilters.q,
					created_from: listFilters.created_from,
					created_to: listFilters.created_to
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: AuditLogsPage) => last.next_cursor,
		enabled: qs.ready
	}));

	const items = $derived(logsQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function applyFilters(e: Event) {
		e.preventDefault();
		appliedActor = actorInput.trim();
		appliedQ = qInput.trim();
		appliedFrom = fromInput;
		appliedTo = toInput;
	}

	function clearFilters() {
		action = '';
		entityType = '';
		actorInput = '';
		qInput = '';
		fromInput = '';
		toInput = '';
		appliedActor = '';
		appliedQ = '';
		appliedFrom = '';
		appliedTo = '';
	}

	function actionTone(actionValue: AuditLog['action']): 'success' | 'info' | 'danger' | 'neutral' {
		switch (actionValue) {
			case 'create':
				return 'success';
			case 'update':
				return 'info';
			case 'delete':
				return 'danger';
			default:
				return 'neutral';
		}
	}
</script>

<svelte:head>
	<title>{t('settings.audit.title')} · {t('nav.settings')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.audit.title')} description={t('settings.audit.description')} />

	<form
		class="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end"
		onsubmit={applyFilters}
	>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 lg:w-40"
			bind:value={action}
		>
			<option value="">{t('settings.audit.filter.actionAll')}</option>
			{#each actionOptions as a (a)}
				<option value={a}>{auditActionLabels[a]}</option>
			{/each}
		</select>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 lg:w-44"
			bind:value={entityType}
		>
			<option value="">{t('settings.audit.filter.entityAll')}</option>
			{#each entityOptions as e (e)}
				<option value={e}>{auditEntityLabels[e]}</option>
			{/each}
		</select>
		<input
			class="h-9 min-w-0 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:w-56"
			placeholder={t('settings.audit.filter.actorPlaceholder')}
			bind:value={actorInput}
		/>
		<input
			class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:min-w-[10rem]"
			placeholder={t('settings.audit.filter.qPlaceholder')}
			bind:value={qInput}
		/>
		<label class="flex flex-col gap-1 text-xs text-text-muted">
			<span>{t('settings.audit.filter.from')}</span>
			<input
				type="date"
				class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
				bind:value={fromInput}
			/>
		</label>
		<label class="flex flex-col gap-1 text-xs text-text-muted">
			<span>{t('settings.audit.filter.to')}</span>
			<input
				type="date"
				class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40"
				bind:value={toInput}
			/>
		</label>
		<div class="flex gap-2">
			<Button type="submit" variant="secondary">{t('settings.audit.filter.apply')}</Button>
			{#if filtersActive}
				<Button type="button" variant="outline" onclick={clearFilters}
					>{t('settings.audit.filter.clear')}</Button
				>
			{/if}
		</div>
	</form>

	{#if logsQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.audit.loading')}</p>
	{:else if logsQuery.isError}
		<p class="text-sm text-danger">{t('settings.audit.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm text-text-muted">{t('settings.audit.empty')}</p>
		</div>
	{:else}
		<ul
			class="min-w-0 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface"
		>
			{#each items as log (log.id)}
				<li class="flex min-w-0 items-start gap-3 px-4 py-3">
					<StatusBadge label={auditActionLabels[log.action]} tone={actionTone(log.action)} />
					<div class="min-w-0 flex-1">
						<p class="truncate text-sm text-text">
							<span class="font-medium">{log.actor_display_name}</span>
							<span class="text-text-muted">· {auditEntityLabels[log.entity_type]}</span>
							{#if log.entity_label}
								<span class="text-text-muted">— {log.entity_label}</span>
							{/if}
						</p>
					</div>
					<time
						class="shrink-0 text-xs whitespace-nowrap text-text-faint"
						datetime={log.created_at}
					>
						{formatDateTime(log.created_at)}
					</time>
				</li>
			{/each}
		</ul>

		{#if logsQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={logsQuery.isFetchingNextPage}
					onclick={() => logsQuery.fetchNextPage()}
				>
					{logsQuery.isFetchingNextPage
						? t('settings.audit.loading')
						: t('settings.audit.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>
