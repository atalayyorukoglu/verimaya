<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { ContactType } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();

	const typesQuery = createQuery(() => ({
		queryKey: ['settings', 'contact-types'],
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes)
	}));

	let newName = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	const types = $derived(
		[...(typesQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
	);

	async function add(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsContactTypes, 'POST', { name });
			newName = '';
			await queryClient.invalidateQueries({ queryKey: ['settings', 'contact-types'] });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Eklenemedi';
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsContactType(id), 'DELETE');
			await queryClient.invalidateQueries({ queryKey: ['settings', 'contact-types'] });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Silinemedi';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Kişi türleri · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="Kişi türleri"
		description="Otel, klinik, transfer, hasta… Kişiler dizini bu türleri kullanır."
	/>

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		{#if typesQuery.isPending}
			<p class="text-sm text-text-muted">Yükleniyor…</p>
		{:else if typesQuery.isError}
			<p class="text-sm text-danger">Türler yüklenemedi.</p>
		{:else}
			<ul class="divide-y divide-border">
				{#each types as t (t.id)}
					<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
						<span class="text-sm text-text">{t.name}</span>
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
							aria-label="Sil"
							disabled={busy}
							onclick={() => void remove(t.id)}
						>
							<Trash2 class="size-3.5" />
						</button>
					</li>
				{/each}
			</ul>
			<form class="mt-4 flex gap-2" onsubmit={add}>
				<input class={fieldClass} bind:value={newName} placeholder="Yeni tür" required />
				<Button type="submit" size="sm" disabled={busy}>
					<Plus class="size-3.5" />
					Ekle
				</Button>
			</form>
			{#if error}
				<p class="mt-2 text-sm text-danger">{error}</p>
			{/if}
		{/if}
	</section>

	<p class="mt-3 text-xs text-text-faint">
		Tip adı “Hasta” olan kişi oluşturulunca otomatik hasta kaydı açılır.
	</p>
</div>
