<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type {
		Contact,
		ContactCreate,
		ContactsBulkTypeResult,
		ContactType,
		ContactUpdate,
		ContractResponse,
		MembershipUser
	} from '@verimaya/shared';
	import { apiPaths, contactStatusLabels, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { contactStatusTone } from '$lib/status-tone';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';

	type ContactsPage = ContractResponse<'GET /v1/contacts'>;
	type MembersPage = { items: MembershipUser[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let q = $state('');
	let search = $state('');
	let typeId = $state('');
	let typeDraft = $state('');
	let defaultTypeApplied = $state(false);
	let formOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let selectionMode = $state(false);
	let selectedIds = $state<string[]>([]);
	let bulkTypeId = $state('');
	let bulkBusy = $state(false);
	let bulkError = $state<string | null>(null);

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	const membersQuery = createQuery(() => ({
		queryKey: qs.keys.members.list({ for: 'contacts-list' }),
		queryFn: () => apiGet<MembersPage>(listUrl('members', { limit: 100 })),
		enabled: qs.ready
	}));

	const contactTypes = $derived(typesQuery.data?.items ?? []);
	const members = $derived(membersQuery.data?.items ?? []);

	$effect(() => {
		if (defaultTypeApplied || contactTypes.length === 0) return;
		const hasta = contactTypes.find((ct) => ct.name === 'Hasta');
		if (hasta) {
			typeId = hasta.id;
			typeDraft = hasta.id;
		}
		defaultTypeApplied = true;
	});

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

	function assigneeName(userId: string | null): string | null {
		if (!userId) return null;
		return members.find((m) => m.id === userId)?.display_name ?? null;
	}

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
		typeId = typeDraft;
		selectedIds = [];
	}

	function clearFilters() {
		q = '';
		search = '';
		typeDraft = '';
		typeId = '';
		selectedIds = [];
		defaultTypeApplied = true;
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

	function enterSelectionMode() {
		selectionMode = true;
	}

	function exitSelectionMode() {
		selectionMode = false;
		selectedIds = [];
		bulkTypeId = '';
		bulkError = null;
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
			exitSelectionMode();
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
				await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
				formOpen = false;
				editing = null;
			} else {
				const created = await apiSend<Contact>(apiPaths.contacts, 'POST', data);
				await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
				formOpen = false;
				editing = null;
				await goto(`/contacts/${created.id}`);
			}
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

<div class="mx-auto max-w-6xl min-w-0">
	<PageHeader title={t('contacts.list.title')} description={listDescription}>
		{#snippet actions()}
			<Button type="button" variant="outline" onclick={() => goto('/contacts/duplicates')}
				>{t('contacts.list.duplicates')}</Button
			>
			<Button type="button" onclick={openCreate}>{t('contacts.list.new')}</Button>
		{/snippet}
	</PageHeader>

	<form
		class="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center"
		onsubmit={submitSearch}
	>
		<input
			class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 lg:min-w-[12rem]"
			placeholder={t('contacts.list.searchPlaceholder')}
			bind:value={q}
		/>
		<select
			class="h-9 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 lg:w-44"
			bind:value={typeDraft}
			aria-label={t('contacts.list.filterTypeAria')}
		>
			<option value="">{t('contacts.list.filterTypeAll')}</option>
			{#each contactTypes as ct (ct.id)}
				<option value={ct.id}>{ct.name}</option>
			{/each}
		</select>
		<div class="flex flex-wrap gap-2">
			<Button type="submit" variant="secondary">{t('contacts.list.filterApply')}</Button>
			{#if search || typeId}
				<Button type="button" variant="outline" onclick={clearFilters}
					>{t('contacts.list.filterClear')}</Button
				>
			{/if}
			{#if selectionMode}
				<Button type="button" variant="outline" disabled={bulkBusy} onclick={exitSelectionMode}
					>{t('contacts.bulk.modeExit')}</Button
				>
			{:else}
				<Button type="button" variant="outline" onclick={enterSelectionMode}
					>{t('contacts.bulk.modeEnter')}</Button
				>
			{/if}
		</div>
	</form>

	{#if selectionMode && selectedIds.length > 0}
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
	{:else if selectionMode && bulkError}
		<p class="mb-4 text-sm text-danger">{bulkError}</p>
	{/if}

	{#if contactsQuery.isPending}
		<p class="text-sm text-text-muted">{t('contacts.list.loading')}</p>
	{:else if contactsQuery.isError}
		<p class="text-sm text-danger">{t('contacts.list.loadError')}</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-8 text-center">
			<p class="text-sm font-medium text-text">{t('contacts.list.emptyTitle')}</p>
			<Button class="mt-4" type="button" onclick={openCreate}>{t('contacts.list.emptyCta')}</Button>
		</div>
	{:else}
		<div class="hidden min-w-0 overflow-hidden rounded-lg border border-border bg-surface md:block">
			<table class="w-full table-fixed text-left text-sm">
				<thead class="border-b border-border bg-surface-2/50 text-xs text-text-muted">
					<tr>
						{#if selectionMode}
							<th class="w-8 px-3 py-3">
								<input
									type="checkbox"
									class="size-4 rounded border-border"
									checked={allPageSelected}
									aria-label={t('contacts.bulk.selectAll')}
									onchange={(e) => toggleAllPage(e.currentTarget.checked)}
								/>
							</th>
						{/if}
						<th class="{selectionMode ? 'w-[22%]' : 'w-[24%]'} px-4 py-3 font-medium"
							>{t('contacts.list.col.name')}</th
						>
						<th class="w-[12%] px-4 py-3 font-medium">{t('contacts.list.col.type')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.phone')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.source')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.status')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.assignee')}</th>
						<th class="w-[10%] px-4 py-3 font-medium"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as c (c.id)}
						<tr class="transition-colors hover:bg-surface-2/60">
							{#if selectionMode}
								<td class="px-3 py-3">
									<input
										type="checkbox"
										class="size-4 rounded border-border"
										checked={selectedIds.includes(c.id)}
										aria-label={t('contacts.bulk.selectRow')}
										onchange={(e) => toggleRow(c.id, e.currentTarget.checked)}
									/>
								</td>
							{/if}
							<td class="px-4 py-3">
								<a href={`/contacts/${c.id}`} class="font-medium text-text hover:underline">
									<span class="line-clamp-2 break-all">{c.display_name}</span>
								</a>
							</td>
							<td class="px-4 py-3">
								<StatusBadge label={c.contact_type_name} tone="neutral" />
							</td>
							<td class="truncate px-4 py-3 text-text-muted tabular-nums">{c.phone ?? '—'}</td>
							<td class="truncate px-4 py-3 text-text-faint">{c.source ?? '—'}</td>
							<td class="px-4 py-3">
								{#if c.status}
									<StatusBadge
										label={contactStatusLabels[c.status]}
										tone={contactStatusTone(c.status)}
									/>
								{:else}
									<span class="text-text-faint">—</span>
								{/if}
							</td>
							<td class="truncate px-4 py-3 text-text-faint">
								{assigneeName(c.assigned_user_id) ?? '—'}
							</td>
							<td class="px-4 py-3 text-right">
								<Button type="button" size="sm" variant="outline" onclick={() => openEdit(c)}
									>{t('common.edit')}</Button
								>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<ul class="space-y-2 md:hidden">
			{#if selectionMode}
				<li class="flex items-center gap-3 px-1 py-1">
					<input
						type="checkbox"
						class="size-4 rounded border-border"
						checked={allPageSelected}
						aria-label={t('contacts.bulk.selectAll')}
						onchange={(e) => toggleAllPage(e.currentTarget.checked)}
					/>
					<span class="text-xs text-text-faint">{t('contacts.bulk.selectAll')}</span>
				</li>
			{/if}
			{#each items as c (c.id)}
				<li class="min-w-0">
					<div
						class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface p-4"
					>
						{#if selectionMode}
							<input
								type="checkbox"
								class="mt-1 size-4 shrink-0 rounded border-border"
								checked={selectedIds.includes(c.id)}
								aria-label={t('contacts.bulk.selectRow')}
								onchange={(e) => toggleRow(c.id, e.currentTarget.checked)}
							/>
						{/if}
						<a href={`/contacts/${c.id}`} class="min-w-0 flex-1 hover:opacity-90">
							<div class="flex flex-wrap items-center gap-2">
								<p class="min-w-0 flex-1 text-sm font-medium break-all text-text">
									{c.display_name}
								</p>
								<StatusBadge label={c.contact_type_name} tone="neutral" />
							</div>
							<p class="mt-1 truncate text-xs text-text-muted tabular-nums">{c.phone ?? '—'}</p>
							<div class="mt-2 flex flex-wrap items-center gap-2">
								{#if c.status}
									<StatusBadge
										label={contactStatusLabels[c.status]}
										tone={contactStatusTone(c.status)}
									/>
								{/if}
								{#if c.source}
									<span class="text-xs text-text-faint">
										{t('contacts.list.col.source')}: {c.source}
									</span>
								{/if}
								{#if assigneeName(c.assigned_user_id)}
									<span class="text-xs text-text-faint">
										{t('contacts.list.col.assignee')}: {assigneeName(c.assigned_user_id)}
									</span>
								{/if}
							</div>
						</a>
						<Button type="button" size="sm" variant="outline" onclick={() => openEdit(c)}
							>{t('common.edit')}</Button
						>
					</div>
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
