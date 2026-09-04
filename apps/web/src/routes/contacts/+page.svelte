<script lang="ts">
	import { createInfiniteQuery, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type {
		Contact,
		ContactCreate,
		ContactType,
		ContactUpdate,
		ContractResponse
	} from '@verimaya/shared';
	import { apiPaths, listUrl } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';

	type ContactsPage = ContractResponse<'GET /v1/contacts'>;

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

	const contactTypes = $derived(typesQuery.data?.items ?? []);

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

<div class="mx-auto w-full max-w-xl min-w-0">
	<header class="mb-4 border-b border-border pb-4">
		<div class="min-w-0">
			<h1 class="text-base font-semibold tracking-tight text-text sm:text-xl">
				{t('contacts.list.title')}
			</h1>
			<p class="mt-0.5 text-sm text-text-muted">{listDescription}</p>
		</div>

		<div class="mt-3.5 flex flex-wrap items-center gap-2">
			<select
				class="h-9 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus:ring-2 focus:ring-brand/40 sm:max-w-44 sm:flex-none"
				bind:value={typeId}
				aria-label={t('contacts.list.filterTypeAria')}
			>
				<option value="">{t('contacts.list.filterTypeAll')}</option>
				{#each contactTypes as ct (ct.id)}
					<option value={ct.id}>{ct.name}</option>
				{/each}
			</select>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				<Button type="button" variant="outline" onclick={() => goto('/contacts/duplicates')}
					>{t('contacts.list.duplicates')}</Button
				>
				<Button type="button" onclick={openCreate}>{t('contacts.list.new')}</Button>
			</div>
		</div>
	</header>

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
						<th class="w-[34%] px-4 py-3 font-medium">{t('contacts.list.col.name')}</th>
						<th class="w-[22%] px-4 py-3 font-medium">{t('contacts.list.col.phone')}</th>
						<th class="w-[30%] px-4 py-3 font-medium">{t('contacts.list.col.email')}</th>
						<th class="w-[14%] px-4 py-3 font-medium"></th>
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
							<td class="truncate px-4 py-3 text-text-muted tabular-nums">{c.phone ?? '—'}</td>
							<td class="truncate px-4 py-3 text-text-muted">{c.email ?? '—'}</td>
							<td class="px-4 py-3 text-right">
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
						class="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3"
					>
						<a href={`/contacts/${c.id}`} class="min-w-0 flex-1 hover:underline">
							<span class="block text-sm font-medium break-all text-text">{c.display_name}</span>
							<span class="mt-0.5 block text-xs text-text-muted tabular-nums">{c.phone ?? '—'}</span
							>
							<span class="mt-0.5 block truncate text-xs text-text-muted">{c.email ?? '—'}</span>
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
