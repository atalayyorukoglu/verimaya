<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { ContactType } from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, ApiRequestError, fieldClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.contactTypes(),
		queryFn: () => apiGet<{ items: ContactType[] }>(apiPaths.settingsContactTypes),
		enabled: qs.ready
	}));

	let newName = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');

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
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.contactTypes() });
		} catch (err) {
			error =
				err instanceof ApiRequestError && err.code === 'duplicate_type_name'
					? t('settings.dictionaries.duplicateName')
					: err instanceof Error
						? err.message
						: 'Eklenemedi';
		} finally {
			busy = false;
		}
	}

	function startRename(row: ContactType) {
		editingId = row.id;
		editName = row.name;
		error = null;
	}

	function cancelRename() {
		editingId = null;
		editName = '';
	}

	async function saveRename(id: string) {
		const name = editName.trim();
		if (!name) return;
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsContactType(id), 'PATCH', { name });
			editingId = null;
			editName = '';
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.contactTypes() });
			await queryClient.invalidateQueries({ queryKey: qs.keys.contacts.all() });
		} catch (err) {
			error =
				err instanceof ApiRequestError && err.code === 'duplicate_type_name'
					? t('settings.dictionaries.duplicateName')
					: err instanceof Error
						? err.message
						: t('settings.contactTypes.renameFailed');
		} finally {
			busy = false;
		}
	}

	async function remove(id: string) {
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsContactType(id), 'DELETE');
			if (editingId === id) cancelRename();
			await queryClient.invalidateQueries({ queryKey: qs.keys.settings.contactTypes() });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Silinemedi';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.contactTypes.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.contactTypes.title')}
		description={t('settings.contactTypes.description')}
	/>

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		{#if typesQuery.isPending}
			<p class="text-sm text-text-muted">{t('settings.contactTypes.loading')}</p>
		{:else if typesQuery.isError}
			<p class="text-sm text-danger">{t('settings.contactTypes.loadError')}</p>
		{:else}
			<ul class="divide-y divide-border">
				{#each types as row (row.id)}
					<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
						{#if editingId === row.id}
							<form
								class="flex min-w-0 flex-1 items-center gap-2"
								onsubmit={(e) => {
									e.preventDefault();
									void saveRename(row.id);
								}}
							>
								<input
									class={fieldClass}
									bind:value={editName}
									disabled={busy}
									aria-label={t('settings.contactTypes.rename')}
								/>
								<Button type="submit" size="sm" disabled={busy || !editName.trim()}>
									{t('settings.contactTypes.renameSave')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={busy}
									onclick={cancelRename}
								>
									{t('settings.contactTypes.renameCancel')}
								</Button>
							</form>
						{:else}
							<span class="min-w-0 flex-1 truncate text-sm text-text">{row.name}</span>
							<div class="flex shrink-0 items-center gap-0.5">
								<button
									type="button"
									class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
									aria-label={t('settings.contactTypes.rename')}
									disabled={busy}
									onclick={() => startRename(row)}
								>
									<Pencil class="size-3.5" />
								</button>
								<button
									type="button"
									class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
									aria-label={t('settings.contactTypes.delete')}
									disabled={busy}
									onclick={() => void remove(row.id)}
								>
									<Trash2 class="size-3.5" />
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
			<form class="mt-4 flex gap-2" onsubmit={add}>
				<input
					class={fieldClass}
					bind:value={newName}
					placeholder={t('settings.contactTypes.newPlaceholder')}
					required
				/>
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
		{t('settings.contactTypes.footnote')}
	</p>
</div>
