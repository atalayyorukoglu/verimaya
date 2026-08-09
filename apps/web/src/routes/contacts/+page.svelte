<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type {
		Contact,
		ContactCreate,
		ContactsBulkTypeResult,
		ContactType,
		ContactUpdate,
		ContractResponse
	} from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type ContactsPage = ContractResponse<'GET /v1/contacts'>;

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let q = $state('');
	let search = $state('');
	let typeId = $state('');
	let formOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let selectedIds = $state<string[]>([]);
	let bulkTypeId = $state('');
	let bulkBusy = $state(false);
	let bulkError = $state<string | null>(null);

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	const contactTypes = $derived(typesQuery.data?.items ?? []);

	const contactsQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.contacts.list({ q: search, type_id: typeId || null }),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<ContactsPage>(
				listUrl('contacts', {
					limit: 25,
					q: search || undefined,
					type_id: typeId || undefined,
					cursor: pageParam
				})
			),
		initialPageParam: null as string | null,
		getNextPageParam: (last: ContactsPage) => last.next_cursor,
		enabled: qs.ready
	}));

	const items = $derived(contactsQuery.data?.pages.flatMap((p) => p.items) ?? []);
	const totalCount = $derived(contactsQuery.data?.pages[0]?.total_count);
	const filtered = $derived(Boolean(search || typeId));
	const listDescription = $derived(
		totalCount == null
			? t('contacts.list.description')
			: filtered
				? t('contacts.list.totalFiltered', { count: String(totalCount) })
				: t('contacts.list.total', { count: String(totalCount) })
	);
	const allPageSelected = $derived(
		items.length > 0 && items.every((c) => selectedIds.includes(c.id))
	);

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
		selectedIds = [];
	}

	function openCreate() {
		editing = null;
		formError = null;
		formOpen = true;
	}

	function openEdit(c: Contact) {
		editing = c;
		formError = null;
		formOpen = true;
	}

	function toggleRow(id: string, checked: boolean) {
		if (checked) {
			if (!selectedIds.includes(id)) selectedIds = [...selectedIds, id];
		} else {
			selectedIds = selectedIds.filter((x) => x !== id);
		}
	}

	function toggleAllPage(checked: boolean) {
		if (checked) {
			const next = [...selectedIds];
			for (const c of items) {
				if (!next.includes(c.id)) next.push(c.id);
			}
			selectedIds = next;
		} else {
			const pageIds = items.map((c) => c.id);
			selectedIds = selectedIds.filter((id) => !pageIds.includes(id));
		}
	}

	function clearSelection() {
		selectedIds = [];
		bulkTypeId = '';
		bulkError = null;
	}

	async function applyBulkType() {
		if (!bulkTypeId || selectedIds.length === 0) return;
		bulkBusy = true;
		bulkError = null;
		try {
			await apiSend<ContactsBulkTypeResult>(apiPaths.contactsBulkType, 'PATCH', {
				contact_ids: selectedIds,
				contact_type_id: bulkTypeId
			});
			clearSelection();
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
		} catch (err) {
			bulkError = err instanceof Error ? err.message : t('contacts.bulk.failed');
		} finally {
			bulkBusy = false;
		}
	}

	async function saveContact(data: ContactCreate | ContactUpdate) {
		saving = true;
		formError = null;
		try {
			if (editing) {
				await apiSend(apiPaths.contact(editing.id), 'PATCH', data);
			} else {
				await apiSend(apiPaths.contacts, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('common.saveFailed');
		} finally {
			saving = false;
		}
	}

	async function deleteContact() {
		if (!editing) return;
		saving = true;
		formError = null;
		try {
			await apiSend(apiPaths.contact(editing.id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.patients.all() });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : t('contacts.deleteFailed');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>{t('contacts.list.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader title={t('contacts.list.title')} description={listDescription}>
		{#snippet actions()}
			<Button type="button" variant="outline" onclick={() => goto('/contacts/duplicates')}
				>{t('contacts.list.duplicates')}</Button
			>
			<Button type="button" onclick={openCreate}>{t('contacts.list.new')}</Button>
		{/snippet}
	</PageHeader>

	<form class="mb-4 flex flex-col gap-2 sm:flex-row" onsubmit={submitSearch}>
		<input
			class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40"
			placeholder="Ad, telefon veya e-posta…"
			bind:value={q}
		/>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 sm:w-44"
			bind:value={typeId}
		>
			<option value="">{t('common.allTypes')}</option>
			{#each contactTypes as ct (ct.id)}
				<option value={ct.id}>{ct.name}</option>
			{/each}
		</select>
		<Button type="submit" variant="secondary">Ara</Button>
	</form>

	{#if selectedIds.length > 0}
		<div
			class="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 sm:flex-row sm:items-center"
		>
			<p class="text-sm text-text">
				{t('contacts.bulk.selected', { count: String(selectedIds.length) })}
			</p>
			<select
				class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 sm:ml-auto sm:w-48"
				bind:value={bulkTypeId}
				disabled={bulkBusy}
			>
				<option value="">{t('contacts.bulk.selectType')}</option>
				{#each contactTypes as ct (ct.id)}
					<option value={ct.id}>{ct.name}</option>
				{/each}
			</select>
			<Button
				type="button"
				size="sm"
				disabled={bulkBusy || !bulkTypeId}
				onclick={() => void applyBulkType()}
			>
				{bulkBusy ? t('contacts.bulk.assigning') : t('contacts.bulk.assignType')}
			</Button>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={bulkBusy}
				onclick={clearSelection}
			>
				{t('contacts.bulk.clearSelection')}
			</Button>
		</div>
		{#if bulkError}
			<p class="mb-4 text-sm text-danger">{bulkError}</p>
		{/if}
	{/if}

	{#if contactsQuery.isPending}
		<p class="text-sm text-text-muted">{t('contacts.list.loading')}</p>
	{:else if contactsQuery.isError}
		<p class="text-sm text-danger">{t('contacts.list.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">{t('contacts.list.empty')}</p>
			<Button class="mt-4" type="button" onclick={openCreate}>{t('contacts.list.new')}</Button>
		</div>
	{:else}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			<li class="flex items-center gap-3 px-3 py-2 sm:px-4">
				<input
					type="checkbox"
					class="size-4 rounded border-border"
					checked={allPageSelected}
					aria-label={t('contacts.bulk.selectAll')}
					onchange={(e) => toggleAllPage(e.currentTarget.checked)}
				/>
				<span class="text-xs text-text-faint">{t('contacts.bulk.selectAll')}</span>
			</li>
			{#each items as c (c.id)}
				<li class="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
					<input
						type="checkbox"
						class="size-4 shrink-0 rounded border-border"
						checked={selectedIds.includes(c.id)}
						aria-label={t('contacts.bulk.selectRow')}
						onchange={(e) => toggleRow(c.id, e.currentTarget.checked)}
					/>
					<a href={`/contacts/${c.id}`} class="min-w-0 flex-1 hover:opacity-90">
						<div class="flex flex-wrap items-center gap-2">
							<p class="truncate text-sm font-medium text-text">{c.display_name}</p>
							<StatusBadge label={c.contact_type_name} tone="neutral" />
							{#if c.is_internal}
								<StatusBadge label={t('common.internal')} tone="info" />
							{/if}
						</div>
						<p class="mt-0.5 truncate text-xs text-text-faint">
							{[c.phone, c.email].filter(Boolean).join(' · ') || t('common.noContact')}
							· {t('common.usageCount', { count: c.usage_count })}
						</p>
					</a>
					<Button type="button" size="sm" variant="outline" onclick={() => openEdit(c)}
						>{t('common.edit')}</Button
					>
				</li>
			{/each}
		</ul>

		{#if contactsQuery.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					variant="outline"
					type="button"
					disabled={contactsQuery.isFetchingNextPage}
					onclick={() => contactsQuery.fetchNextPage()}
				>
					{contactsQuery.isFetchingNextPage ? t('common.loading') : t('contacts.list.loadMore')}
				</Button>
			</div>
		{/if}
	{/if}
</div>

<ContactFormDialog
	bind:open={formOpen}
	contact={editing}
	{saving}
	error={formError}
	onsubmit={saveContact}
	ondelete={editing ? deleteContact : undefined}
/>
