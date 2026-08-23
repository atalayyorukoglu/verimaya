<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { IncidentType } from '@verimaya/shared';
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

	/**
	 * v1 yalnız klinik departmanı — `area=clinic` sabit, alan seçici yok.
	 * docs/2026-08-23-maya-icgoru-sorulari.md § 5. Diğer alanlar (otel/transfer/
	 * satış/reklam) karara bağlı, bkz. docs/FIKIRLER.md § Olay kaydı — diğer departmanlar.
	 */
	const AREA = 'clinic';

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const typesQuery = createQuery(() => ({
		queryKey: qs.keys.settings.incidentTypes({ area: AREA }),
		queryFn: () =>
			apiGet<{ items: IncidentType[] }>(`${apiPaths.settingsIncidentTypes}?area=${AREA}`),
		enabled: qs.ready
	}));

	let newName = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');
	/** Silme onayı bekleyen satır — kullanımdaysa RESTRICT nedeniyle onay değil uyarı gösterilir. */
	let confirmingId = $state<string | null>(null);

	const types = $derived(
		[...(typesQuery.data?.items ?? [])].sort((a, b) => a.sort_order - b.sort_order)
	);

	function invalidate() {
		return queryClient.invalidateQueries({
			queryKey: qs.keys.settings.incidentTypes({ area: AREA })
		});
	}

	async function add(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name) return;
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsIncidentTypes, 'POST', { area: AREA, name });
			newName = '';
			await invalidate();
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

	function startRename(row: IncidentType) {
		confirmingId = null;
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
			await apiSend(apiPaths.settingsIncidentType(id), 'PATCH', { name });
			editingId = null;
			editName = '';
			await invalidate();
		} catch (err) {
			error =
				err instanceof ApiRequestError && err.code === 'duplicate_type_name'
					? t('settings.dictionaries.duplicateName')
					: err instanceof Error
						? err.message
						: t('settings.incidentTypes.renameFailed');
		} finally {
			busy = false;
		}
	}

	function askRemove(id: string) {
		cancelRename();
		confirmingId = id;
		error = null;
	}

	function cancelRemove() {
		confirmingId = null;
	}

	async function remove(id: string) {
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsIncidentType(id), 'DELETE');
			if (editingId === id) cancelRename();
			await invalidate();
			confirmingId = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Silinemedi';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.incidentTypes.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.incidentTypes.title')}
		description={t('settings.incidentTypes.description')}
	/>

	<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
		{#if typesQuery.isPending}
			<p class="text-sm text-text-muted">{t('settings.incidentTypes.loading')}</p>
		{:else if typesQuery.isError}
			<p class="text-sm text-danger">{t('settings.incidentTypes.loadError')}</p>
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
									aria-label={t('settings.incidentTypes.rename')}
								/>
								<Button type="submit" size="sm" disabled={busy || !editName.trim()}>
									{t('settings.incidentTypes.renameSave')}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={busy}
									onclick={cancelRename}
								>
									{t('settings.incidentTypes.renameCancel')}
								</Button>
							</form>
						{:else if confirmingId === row.id}
							<div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
								<span class="min-w-0 flex-1 text-sm text-text-muted">
									{row.usage_count > 0
										? t('settings.incidentTypes.deleteBlocked', {
												name: row.name,
												count: row.usage_count
											})
										: t('settings.incidentTypes.deleteConfirmUnused')}
								</span>
								<div class="flex shrink-0 gap-2">
									{#if row.usage_count === 0}
										<Button
											type="button"
											variant="destructive"
											size="sm"
											disabled={busy}
											onclick={() => void remove(row.id)}
										>
											{t('settings.incidentTypes.deleteConfirmYes')}
										</Button>
									{/if}
									<Button
										type="button"
										variant="outline"
										size="sm"
										disabled={busy}
										onclick={cancelRemove}
									>
										{t('settings.incidentTypes.deleteConfirmNo')}
									</Button>
								</div>
							</div>
						{:else}
							<span class="min-w-0 flex-1 truncate text-sm text-text">{row.name}</span>
							{#if row.usage_count > 0}
								<span class="shrink-0 text-xs text-text-muted tabular-nums">
									{t('settings.incidentTypes.usageCount', { count: row.usage_count })}
								</span>
							{/if}
							<div class="flex shrink-0 items-center gap-0.5">
								<button
									type="button"
									class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
									aria-label={t('settings.incidentTypes.rename')}
									disabled={busy}
									onclick={() => startRename(row)}
								>
									<Pencil class="size-3.5" />
								</button>
								<button
									type="button"
									class="cursor-pointer rounded-[6px] p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-40"
									aria-label={t('settings.incidentTypes.delete')}
									disabled={busy}
									onclick={() => askRemove(row.id)}
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
					placeholder={t('settings.incidentTypes.newPlaceholder')}
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
		{t('settings.incidentTypes.footnote')}
	</p>
</div>
