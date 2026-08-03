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
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type ContactsPage = ContractResponse<'GET /v1/contacts'>;

	const queryClient = useQueryClient();

	let q = $state('');
	let search = $state('');
	let typeId = $state('');
	let formOpen = $state(false);
	let editing = $state<Contact | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);

	const typesQuery = createQuery(() => ({
		queryKey: ['settings', 'contact-types'],
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes)
	}));

	const contactTypes = $derived(typesQuery.data?.items ?? []);

	const contactsQuery = createInfiniteQuery(() => ({
		queryKey: ['contacts', { q: search, type_id: typeId || null }],
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
		getNextPageParam: (last: ContactsPage) => last.next_cursor
	}));

	const items = $derived(contactsQuery.data?.pages.flatMap((p) => p.items) ?? []);

	function submitSearch(e: Event) {
		e.preventDefault();
		search = q.trim();
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
			} else {
				await apiSend(apiPaths.contacts, 'POST', data);
			}
			await queryClient.invalidateQueries({ queryKey: ['contacts'] });
			await queryClient.invalidateQueries({ queryKey: ['patients'] });
			formOpen = false;
			editing = null;
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Kayıt başarısız';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head>
	<title>Kişiler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-5xl min-w-0">
	<PageHeader
		title="Kişiler"
		description="Otel, klinik, transfer, hasta ve diğer cariler — hasta iş kaydından ayrı dizin."
	>
		{#snippet actions()}
			<Button type="button" variant="outline" onclick={() => goto('/contacts/duplicates')}
				>Çift kayıt tara</Button
			>
			<Button type="button" onclick={openCreate}>Yeni kişi</Button>
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
			<option value="">Tüm türler</option>
			{#each contactTypes as t (t.id)}
				<option value={t.id}>{t.name}</option>
			{/each}
		</select>
		<Button type="submit" variant="secondary">Ara</Button>
	</form>

	{#if contactsQuery.isPending}
		<p class="text-sm text-text-muted">Yükleniyor…</p>
	{:else if contactsQuery.isError}
		<p class="text-sm text-danger">Kişiler yüklenemedi.</p>
	{:else if items.length === 0}
		<div class="rounded-lg border border-border bg-surface p-6 text-center">
			<p class="text-sm text-text-muted">Kişi bulunamadı.</p>
			<Button class="mt-4" type="button" onclick={openCreate}>Yeni kişi</Button>
		</div>
	{:else}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			{#each items as c (c.id)}
				<li class="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
					<a href={`/contacts/${c.id}`} class="min-w-0 flex-1 hover:opacity-90">
						<div class="flex flex-wrap items-center gap-2">
							<p class="truncate text-sm font-medium text-text">{c.display_name}</p>
							<StatusBadge label={c.contact_type_name} tone="neutral" />
							{#if c.is_internal}
								<StatusBadge label="İç" tone="info" />
							{/if}
						</div>
						<p class="mt-0.5 truncate text-xs text-text-faint">
							{[c.phone, c.email].filter(Boolean).join(' · ') || 'İletişim yok'}
							· kullanım {c.usage_count}
						</p>
					</a>
					<Button type="button" size="sm" variant="outline" onclick={() => openEdit(c)}
						>Düzenle</Button
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
					{contactsQuery.isFetchingNextPage ? 'Yükleniyor…' : 'Daha fazla yükle'}
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
/>
