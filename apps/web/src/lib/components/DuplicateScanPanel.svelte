<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		Contact,
		ContactDuplicateGroup,
		ContactDuplicateGroupsResponse
	} from '@verimaya/shared';
	import { apiPaths, duplicateMatchTypeLabels } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	let {
		listHref,
		listLabel
	}: {
		listHref: string;
		listLabel: string;
	} = $props();

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let keepByGroup = $state<Record<string, string>>({});
	let mergingKey = $state<string | null>(null);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	const groupsQuery = createQuery(() => ({
		queryKey: qs.keys.contacts.duplicateGroups(),
		queryFn: () => apiGet<ContactDuplicateGroupsResponse>(apiPaths.contactsDuplicateGroups),
		enabled: qs.ready
	}));

	const groups = $derived(groupsQuery.data?.items ?? []);
	const truncated = $derived(groupsQuery.data?.truncated ?? false);
	const scannedCount = $derived(groupsQuery.data?.scanned_count ?? 0);

	function groupKey(g: ContactDuplicateGroup): string {
		const members = g.contacts
			.map((c) => c.id)
			.sort()
			.join(',');
		return `${g.match_type}:${g.label}:${members}`;
	}

	function contactRows(g: ContactDuplicateGroup): Array<{
		id: string;
		title: string;
		subtitle: string;
		meta?: string;
	}> {
		return g.contacts.map((c: Contact) => ({
			id: c.id,
			title: c.display_name,
			subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || t('duplicates.noContact'),
			meta: t('duplicates.usageMeta', {
				type: c.contact_type_name,
				count: String(c.usage_count)
			})
		}));
	}

	function ensureKeep(g: ContactDuplicateGroup): string {
		const key = groupKey(g);
		const rows = contactRows(g);
		const current = keepByGroup[key];
		if (current && rows.some((r) => r.id === current)) return current;
		return rows[0]?.id ?? '';
	}

	async function mergeGroup(g: ContactDuplicateGroup) {
		const key = groupKey(g);
		const keep_id = ensureKeep(g);
		const rows = contactRows(g);
		const merge_ids = rows.map((r) => r.id).filter((id) => id !== keep_id);
		if (!keep_id || merge_ids.length === 0) return;

		mergingKey = key;
		error = null;
		success = null;
		try {
			await apiSend(apiPaths.contactsMerge, 'POST', { keep_id, merge_ids });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.duplicateGroups() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			success = t('duplicates.mergeSuccess', { count: String(merge_ids.length) });
			const next = { ...keepByGroup };
			delete next[key];
			keepByGroup = next;
		} catch (err) {
			error = err instanceof Error ? err.message : t('duplicates.mergeFailed');
		} finally {
			mergingKey = null;
		}
	}
</script>

<a href={listHref} class="mb-4 inline-block text-sm text-info hover:underline">← {listLabel}</a>

<p class="mb-4 text-sm text-text-muted">{t('duplicates.contactsHint')}</p>

{#if error}
	<p class="mb-3 text-sm text-danger">{error}</p>
{/if}
{#if success}
	<p class="mb-3 text-sm text-success">{success}</p>
{/if}

{#if groupsQuery.isPending}
	<p class="text-sm text-text-muted">{t('duplicates.scanning')}</p>
{:else if groupsQuery.isError}
	<p class="text-sm text-danger">{t('duplicates.loadError')}</p>
{:else}
	{#if truncated}
		<p class="mb-3 text-sm text-warning" role="status">
			{t('duplicates.scan.truncated', { scanned_count: String(scannedCount) })}
		</p>
	{/if}
	{#if groups.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm font-medium text-text">{t('duplicates.emptyTitle')}</p>
			<p class="mt-1 text-xs text-text-muted">{t('duplicates.emptyBody')}</p>
		</div>
	{:else}
		<ul class="space-y-4">
			{#each groups as g (groupKey(g))}
				{@const key = groupKey(g)}
				{@const rows = contactRows(g)}
				{@const keepId = keepByGroup[key] ?? rows[0]?.id ?? ''}
				<li class="overflow-hidden rounded-lg border border-border bg-surface">
					<div class="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
						<StatusBadge label={duplicateMatchTypeLabels[g.match_type]} tone="warning" />
						<span class="truncate font-mono text-xs text-text-muted">{g.label}</span>
						<span class="text-xs text-text-faint">
							{t('duplicates.recordCount', { count: String(rows.length) })}
						</span>
					</div>
					<ul class="divide-y divide-border">
						{#each rows as row (row.id)}
							<li class="flex min-w-0 items-start gap-3 px-3 py-3 sm:px-4">
								<input
									type="radio"
									name={`keep-${key}`}
									class="mt-1"
									checked={keepId === row.id}
									onchange={() => {
										keepByGroup = { ...keepByGroup, [key]: row.id };
									}}
								/>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-text">{row.title}</p>
									<p class="mt-0.5 truncate text-xs text-text-faint">{row.subtitle}</p>
									{#if row.meta}
										<p class="mt-0.5 text-xs text-text-muted">{row.meta}</p>
									{/if}
								</div>
								<a href={`/contacts/${row.id}`} class="shrink-0 text-xs text-brand hover:underline">
									{t('duplicates.open')}
								</a>
							</li>
						{/each}
					</ul>
					<div class="flex justify-end border-t border-border px-3 py-2.5 sm:px-4">
						<Button
							type="button"
							size="sm"
							disabled={mergingKey === key || rows.length < 2}
							onclick={() => mergeGroup(g)}
						>
							{#if mergingKey === key}
								{t('duplicates.merging')}
							{:else}
								{t('duplicates.mergeAction')}
							{/if}
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
{/if}
