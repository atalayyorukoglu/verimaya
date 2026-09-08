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
	let qInput = $state('');
	let appliedQ = $state('');
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
			type_id: typeId || null,
			q: appliedQ || null
		}),
		queryFn: ({ pageParam }: { pageParam: string | null }) =>
			apiGet<ContactsPage>(
				listUrl('contacts', {
					limit: 15,
					q: appliedQ || undefined,
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
	const filtered = $derived(Boolean(typeId) || Boolean(appliedQ));
	const listDescription = $derived(
		totalCount == null
			? t('contacts.list.description')
			: filtered
				? t('contacts.list.totalFiltered', { count: String(totalCount) })
				: t('contacts.list.total', { count: String(totalCount) })
	);

	function applySearch(event: SubmitEvent) {
		event.preventDefault();
		appliedQ = qInput.trim();
	}

	function clearSearch() {
		qInput = '';
		appliedQ = '';
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

<div class="mx-auto w-full max-w-xl min-w-0">
	<header class="mb-4 border-b border-border pb-4">
		<!-- Eylemler başlık hizasında; altındaki satır yalnız arama + tür filtresi. -->
		<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
			<div class="min-w-0">
				<h1 class="text-base font-semibold tracking-tight text-text sm:text-xl">
					{t('contacts.list.title')}
				</h1>
				<p class="mt-0.5 text-sm text-text-muted">{listDescription}</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<Button type="button" variant="outline" onclick={() => goto('/contacts/duplicates')}
					>{t('contacts.list.duplicates')}</Button
				>
				<Button type="button" onclick={openCreate}>{t('contacts.list.new')}</Button>
			</div>
		</div>

		<!--
			Finans ile aynı desen: arama Enter ile uygulanır (her tuşta istek atmaz).
			`flex-1` yalnız `sm`'de — mobilde `flex-col` ana ekseni dikey yapıp
			`flex-basis: 0` ile kutunun yüksekliğini eziyor.
		-->
		<form
			class="mt-3.5 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center"
			onsubmit={applySearch}
		>
			<input
				class="box-border h-11 w-full min-w-0 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none placeholder:text-text-faint focus:ring-2 focus:ring-brand/40 sm:h-9 sm:w-auto sm:flex-1 sm:text-sm"
				placeholder={t('contacts.list.searchPlaceholder')}
				aria-label={t('contacts.list.search')}
				bind:value={qInput}
			/>
			<div class="flex min-w-0 items-center gap-2">
				<select
					class="h-11 min-w-0 flex-1 rounded-[6px] border border-border bg-surface px-3 text-base text-text outline-none focus:ring-2 focus:ring-brand/40 sm:h-9 sm:w-44 sm:flex-none sm:text-sm"
					bind:value={typeId}
					aria-label={t('contacts.list.filterTypeAria')}
				>
					<option value="">{t('contacts.list.filterTypeAll')}</option>
					{#each contactTypes as ct (ct.id)}
						<option value={ct.id}>{ct.name}</option>
					{/each}
				</select>
				<Button class="min-h-11 shrink-0 sm:min-h-9" type="submit" variant="secondary"
					>{t('contacts.list.search')}</Button
				>
				{#if appliedQ}
					<Button
						class="min-h-11 shrink-0 sm:min-h-9"
						type="button"
						variant="ghost"
						onclick={clearSearch}>{t('contacts.list.filterClear')}</Button
					>
				{/if}
			</div>
		</form>
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
