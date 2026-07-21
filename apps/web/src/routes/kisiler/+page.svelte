<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import type { Contact, ContactCreate, ContactType, ContactUpdate } from '@verimaya/shared';
	import { apiGet, apiSend, listUrl } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ContactFormDialog from '$lib/components/ContactFormDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import StatusBadge from '$lib/components/StatusBadge.svelte';

	type Page = { items: Contact[]; next_cursor: string | null };

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
		queryFn: () => apiGet<{ items: ContactType[] }>('/v1/settings/contact-types')
	}));

	const contactsQuery = createQuery(() => ({
		queryKey: ['contacts', { q: search, type_id: typeId || null, limit: 100 }],
		queryFn: () =>
			apiGet<Page>(
				listUrl('contacts', {
					limit: 100,
					q: search || undefined,
					type_id: typeId || undefined
				})
			)
	}));

	const items = $derived(contactsQuery.data?.items ?? []);

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
				await apiSend(`/v1/contacts/${editing.id}`, 'PATCH', data);
			} else {
				await apiSend('/v1/contacts', 'POST', data);
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
			<Button type="button" variant="outline" onclick={() => goto('/kisiler/cift-kayit')}
				>Çift kayıt tara</Button
			>
			<Button type="button" onclick={openCreate}>Yeni kişi</Button>
		{/snippet}
	</PageHeader>

	<form class="mb-4 flex flex-col gap-2 sm:flex-row" onsubmit={submitSearch}>
		<input
			class="border-border bg-surface text-text placeholder:text-text-faint h-9 min-w-0 flex-1 rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40"
			placeholder="Ad, telefon veya e-posta…"
			bind:value={q}
		/>
		<select
			class="border-border bg-surface text-text h-9 rounded-[6px] border px-3 text-sm outline-none focus:ring-2 focus:ring-brand/40 sm:w-44"
			bind:value={typeId}
		>
			<option value="">Tüm türler</option>
			{#each typesQuery.data?.items ?? [] as t (t.id)}
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
			<p class="text-sm text-text-muted">Kişi yok.</p>
		</div>
	{:else}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
			{#each items as c (c.id)}
				<li class="flex min-w-0 items-center gap-3 px-3 py-3 sm:px-4">
					<a href={`/kisiler/${c.id}`} class="min-w-0 flex-1 hover:opacity-90">
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
	{/if}
</div>

<ContactFormDialog
	bind:open={formOpen}
	contact={editing}
	{saving}
	error={formError}
	onsubmit={saveContact}
/>
