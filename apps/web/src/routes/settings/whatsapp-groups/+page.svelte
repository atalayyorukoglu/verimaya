<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type {
		WhatsappChat,
		WhatsappChatListResponse,
		WhatsappChatPurpose
	} from '@verimaya/shared';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { formatDateTime } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import { Button } from '$lib/components/ui/button';
	import Pencil from '@lucide/svelte/icons/pencil';

	/**
	 * WhatsApp grupları.
	 *
	 * İki işi var: (1) gelen kutusunda `1203631…@g.us` yerine grubun adı görünsün,
	 * (2) ayrıştırıcı bu grupta ne aranacağını bilsin. Ad sağlayıcıdan gelmiyor —
	 * WAHA'nın NOWEB motoru webhook gövdesinde sohbet adı göndermiyor.
	 */
	const PURPOSES: WhatsappChatPurpose[] = ['finance', 'operations', 'mixed', 'ignore'];

	const queryClient = useQueryClient();
	const qs = useQueryScope();

	const chatsQuery = createQuery(() => ({
		queryKey: qs.keys.settings.whatsappChats(),
		queryFn: () => apiGet<WhatsappChatListResponse>(apiPaths.settingsWhatsappChats),
		enabled: qs.ready
	}));

	const named = $derived(chatsQuery.data?.items ?? []);
	const unnamed = $derived(chatsQuery.data?.unnamed ?? []);

	let error = $state<string | null>(null);
	let busy = $state(false);

	/** Adlandırma formu — hangi adsız sohbet açık, ne yazıldı. */
	let namingChatId = $state<string | null>(null);
	let newName = $state('');
	let newPurpose = $state<WhatsappChatPurpose>('mixed');

	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editPurpose = $state<WhatsappChatPurpose>('mixed');

	function invalidate() {
		return queryClient.invalidateQueries({ queryKey: qs.keys.settings.whatsappChats() });
	}

	function startNaming(chatId: string) {
		editingId = null;
		namingChatId = chatId;
		newName = '';
		newPurpose = 'mixed';
		error = null;
	}

	async function save(e: Event) {
		e.preventDefault();
		const name = newName.trim();
		if (!name || !namingChatId) return;
		busy = true;
		error = null;
		try {
			await apiSend(apiPaths.settingsWhatsappChats, 'POST', {
				chat_id: namingChatId,
				name,
				purpose: newPurpose
			});
			namingChatId = null;
			newName = '';
			await invalidate();
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.whatsappGroups.saveFailed');
		} finally {
			busy = false;
		}
	}

	function startEdit(row: WhatsappChat) {
		namingChatId = null;
		editingId = row.id;
		editName = row.name;
		editPurpose = row.purpose;
		error = null;
	}

	async function saveEdit(id: string) {
		const name = editName.trim();
		if (!name) return;
		busy = true;
		error = null;
		try {
			await apiSend(`${apiPaths.settingsWhatsappChats}/${id}`, 'PATCH', {
				name,
				purpose: editPurpose
			});
			editingId = null;
			await invalidate();
		} catch (err) {
			error = err instanceof Error ? err.message : t('settings.whatsappGroups.saveFailed');
		} finally {
			busy = false;
		}
	}

	const purposeLabel = (p: WhatsappChatPurpose) => t(`settings.whatsappGroups.purpose.${p}`);
</script>

<svelte:head>
	<title>{t('settings.whatsappGroups.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.whatsappGroups.title')}
		description={t('settings.whatsappGroups.description')}
	/>

	{#if error}
		<p class="mb-3 text-sm text-danger">{error}</p>
	{/if}

	{#if chatsQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.whatsappGroups.loading')}</p>
	{:else if chatsQuery.isError}
		<p class="text-sm text-danger">{t('settings.whatsappGroups.loadError')}</p>
	{:else}
		<!--
			Adsızlar ÜSTTE: bu ekrana gelme sebebi çoğunlukla "şu grubun adını gireyim".
			Adlandırılmış liste referans olarak altta durur.
		-->
		{#if unnamed.length > 0}
			<section class="mb-4 rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">
					{t('settings.whatsappGroups.unnamedHeading')}
					<span class="font-normal text-text-muted">({unnamed.length})</span>
				</h2>
				<p class="mt-1 mb-3 text-sm text-text-muted">
					{t('settings.whatsappGroups.unnamedHint')}
				</p>
				<ul class="divide-y divide-border">
					{#each unnamed as row (row.chat_id)}
						<li class="py-3 first:pt-0 last:pb-0">
							<div class="flex flex-wrap items-baseline gap-2">
								<span class="truncate font-mono text-xs text-text-faint">{row.chat_id}</span>
								<span class="text-xs text-text-muted">
									{t('settings.whatsappGroups.messageCount', {
										count: String(row.message_count)
									})}
								</span>
								<time class="ml-auto text-xs text-text-faint" datetime={row.last_at}>
									{formatDateTime(row.last_at)}
								</time>
							</div>
							{#if row.last_body}
								<p class="mt-1 line-clamp-2 text-sm text-text">{row.last_body}</p>
							{/if}

							{#if namingChatId === row.chat_id}
								<form class="mt-2 flex flex-wrap items-center gap-2" onsubmit={save}>
									<input
										class="{fieldClass} min-w-40 flex-1"
										bind:value={newName}
										disabled={busy}
										placeholder={t('settings.whatsappGroups.namePlaceholder')}
										aria-label={t('settings.whatsappGroups.name')}
									/>
									<select
										class={fieldClass}
										bind:value={newPurpose}
										disabled={busy}
										aria-label={t('settings.whatsappGroups.purposeLabel')}
									>
										{#each PURPOSES as p (p)}
											<option value={p}>{purposeLabel(p)}</option>
										{/each}
									</select>
									<Button type="submit" size="sm" disabled={busy || !newName.trim()}>
										{t('common.save')}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busy}
										onclick={() => (namingChatId = null)}
									>
										{t('common.cancel')}
									</Button>
								</form>
							{:else}
								<Button
									type="button"
									size="sm"
									variant="outline"
									class="mt-2"
									onclick={() => startNaming(row.chat_id)}
								>
									{t('settings.whatsappGroups.nameAction')}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section class="rounded-lg border border-border bg-surface p-4 sm:p-5">
			<h2 class="mb-3 text-sm font-semibold text-text">
				{t('settings.whatsappGroups.namedHeading')}
			</h2>
			{#if named.length === 0}
				<p class="text-sm text-text-muted">{t('settings.whatsappGroups.empty')}</p>
			{:else}
				<ul class="divide-y divide-border">
					{#each named as row (row.id)}
						<li class="py-2.5 first:pt-0 last:pb-0">
							{#if editingId === row.id}
								<form
									class="flex flex-wrap items-center gap-2"
									onsubmit={(e) => {
										e.preventDefault();
										void saveEdit(row.id);
									}}
								>
									<input
										class="{fieldClass} min-w-40 flex-1"
										bind:value={editName}
										disabled={busy}
										aria-label={t('settings.whatsappGroups.name')}
									/>
									<select
										class={fieldClass}
										bind:value={editPurpose}
										disabled={busy}
										aria-label={t('settings.whatsappGroups.purposeLabel')}
									>
										{#each PURPOSES as p (p)}
											<option value={p}>{purposeLabel(p)}</option>
										{/each}
									</select>
									<Button type="submit" size="sm" disabled={busy || !editName.trim()}>
										{t('common.save')}
									</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										disabled={busy}
										onclick={() => (editingId = null)}
									>
										{t('common.cancel')}
									</Button>
								</form>
							{:else}
								<div class="flex items-center gap-3">
									<div class="min-w-0 flex-1">
										<span class="block truncate text-sm font-medium text-text">{row.name}</span>
										<span class="block truncate text-xs text-text-muted">
											{purposeLabel(row.purpose)} ·
											{t('settings.whatsappGroups.messageCount', {
												count: String(row.message_count)
											})}
										</span>
									</div>
									<Button
										type="button"
										size="icon"
										variant="ghost"
										aria-label={t('common.edit')}
										onclick={() => startEdit(row)}
									>
										<Pencil class="size-4" />
									</Button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>
