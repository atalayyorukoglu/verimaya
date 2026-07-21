<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { AppointmentTypeSetting } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();

	const typesQuery = createQuery(() => ({
		queryKey: ['settings', 'appointment-types'],
		queryFn: () => apiGet<{ items: AppointmentTypeSetting[] }>('/v1/settings/appointment-types')
	}));

	const items = $derived(
		[...(typesQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
	);

	let newName = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	async function addType(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		saving = true;
		error = null;
		try {
			await apiSend('/v1/settings/appointment-types', 'POST', { name });
			newName = '';
			await queryClient.invalidateQueries({ queryKey: ['settings', 'appointment-types'] });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Eklenemedi';
		} finally {
			saving = false;
		}
	}

	async function remove(item: AppointmentTypeSetting) {
		if (!confirm(`“${item.name}” silinsin mi?`)) return;
		await apiSend(`/v1/settings/appointment-types/${item.id}`, 'DELETE');
		await queryClient.invalidateQueries({ queryKey: ['settings', 'appointment-types'] });
	}
</script>

<svelte:head>
	<title>Randevu ayarları · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title="Randevu ayarları" description="Randevu tipleri. Checklist şablonları Faz 1." />

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		<h2 class="text-sm font-semibold text-text">Tipler</h2>
		{#if typesQuery.isPending}
			<p class="mt-3 text-sm text-text-muted">Yükleniyor…</p>
		{:else if typesQuery.isError}
			<p class="mt-3 text-sm text-danger">Yüklenemedi.</p>
		{:else}
			<ul class="mt-3 divide-y divide-border">
				{#each items as item (item.id)}
					<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
						<span class="text-sm text-text">{item.name}</span>
						<button
							type="button"
							class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
							aria-label="Sil"
							onclick={() => remove(item)}
						>
							<Trash2 class="size-3.5" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<form class="mt-4 flex gap-2" onsubmit={addType}>
			<input
				class={fieldClass}
				bind:value={newName}
				placeholder="Yeni tip adı"
				maxlength="128"
				required
			/>
			<Button type="submit" size="sm" disabled={saving}>
				<Plus class="size-3.5" />
				Ekle
			</Button>
		</form>
		{#if error}
			<p class="mt-2 text-xs text-danger">{error}</p>
		{/if}
	</section>

	<div class="mt-4 rounded-lg border border-dashed border-border bg-surface/50 p-4">
		<p class="text-sm font-medium text-text">Checklist şablonları</p>
		<p class="mt-1 text-sm text-text-muted">
			Tracker’daki “pasaport kopyası, onam formu…” maddeleri. Verimaya’da dosya yükleme ile birlikte
			Faz 1’de gelir; şimdilik yok.
		</p>
	</div>
</div>
