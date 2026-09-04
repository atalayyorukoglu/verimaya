<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type {
		Contact,
		ContactCreate,
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
	import { memberMatchesAssignee } from '$lib/member-assignee';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';

	type ContactsPage = ContractResponse<'GET /v1/contacts'>;
	type MembersPage = { items: MembershipUser[]; next_cursor: string | null };

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	let typeId = $state('');
	let defaultTypeApplied = $state(false);
	let formOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

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
		if (hasta) typeId = hasta.id;
		defaultTypeApplied = true;
	});

	const contactsQuery = createInfiniteQuery(() => ({
		queryKey: qs.keys.contacts.list({
			type_id: typeId || null
		}),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<ContactsPage>(
				listUrl('contacts', {
					limit: 15,
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
	const filtered = $derived(Boolean(typeId));
	const listDescription = $derived(
		totalCount == null
			? t('contacts.list.description')
			: filtered
				? t('contacts.list.totalFiltered', { count: String(totalCount) })
				: t('contacts.list.total', { count: String(totalCount) })
	);

	function assigneeName(userId: string | null): string | null {
		if (!userId) return null;
		return members.find((m) => memberMatchesAssignee(m, userId))?.display_name ?? null;
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

	<div class="mb-4">
		<select
			class="h-9 w-full rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 sm:w-44"
			bind:value={typeId}
			aria-label={t('contacts.list.filterTypeAria')}
		>
			<option value="">{t('contacts.list.filterTypeAll')}</option>
			{#each contactTypes as ct (ct.id)}
				<option value={ct.id}>{ct.name}</option>
			{/each}
		</select>
	</div>

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
						<th class="w-[24%] px-4 py-3 font-medium">{t('contacts.list.col.name')}</th>
						<th class="w-[12%] px-4 py-3 font-medium">{t('contacts.list.col.type')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.phone')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.source')}</th>
						<th class="w-[12%] px-4 py-3 font-medium">{t('contacts.list.col.status')}</th>
						<th class="w-[14%] px-4 py-3 font-medium">{t('contacts.list.col.assignee')}</th>
						<th class="w-[10%] px-4 py-3 font-medium"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-border">
					{#each items as c (c.id)}
						<tr class="transition-colors hover:bg-surface-2/60">
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
			{#each items as c (c.id)}
				<li class="min-w-0">
					<div
						class="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
					>
						<a
							href={`/contacts/${c.id}`}
							class="min-w-0 flex-1 text-sm font-medium break-all text-text hover:underline"
						>
							{c.display_name}
						</a>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							class="shrink-0"
							aria-label={t('common.edit')}
							onclick={() => openEdit(c)}
						>
							<Pencil class="size-4" />
						</Button>
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
