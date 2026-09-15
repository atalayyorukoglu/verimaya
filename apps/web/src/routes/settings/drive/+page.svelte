<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { apiPaths, type DriveConnectionStatus, type DriveSyncResponse } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { PUBLIC_API_URL } from '$lib/env';
	import { formatDateTime } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const apiOrigin = PUBLIC_API_URL.replace(/\/$/, '');

	const statusQuery = createQuery(() => ({
		queryKey: qs.keys.integrations.driveStatus(),
		queryFn: () => apiGet<DriveConnectionStatus>(apiPaths.settingsDrive),
		enabled: qs.ready
	}));

	const connected = $derived(Boolean(statusQuery.data?.connected));
	const flash = $derived(page.url.searchParams.get('drive') === 'connected');

	/** OAuth başlangıcı tam sayfa yönlendirmedir; oturum çerezi API'ye gider. */
	const authorizeHref = $derived(`${apiOrigin}${apiPaths.settingsDriveAuthorize}`);

	let disconnecting = $state(false);
	let disconnectError = $state<string | null>(null);
	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	let syncOk = $state<string | null>(null);

	function cardMeta(data: DriveConnectionStatus | undefined): { label: string; value: string }[] {
		return [
			{
				label: t('settings.drive.statusLabel'),
				value: data?.connected
					? t('settings.drive.statusConnected')
					: t('settings.drive.statusDisconnected')
			},
			{ label: t('settings.drive.accountLabel'), value: data?.account_email ?? '—' },
			{
				label: t('settings.drive.folderCountLabel'),
				value: data ? String(data.folder_count) : '—'
			},
			{
				label: t('settings.drive.fileCountLabel'),
				value: data ? String(data.mirrored_file_count) : '—'
			},
			{
				label: t('settings.drive.pendingLabel'),
				value: data ? String(data.pending_count) : '—'
			}
		];
	}

	const lastRunText = $derived.by(() => {
		const data = statusQuery.data;
		if (!data?.last_run_at) return t('settings.drive.lastRunNever');
		return t('settings.drive.lastRunSummary', {
			when: formatDateTime(data.last_run_at),
			sent: String(data.last_run_sent),
			skipped: String(data.last_run_skipped),
			failed: String(data.last_run_failed)
		});
	});

	async function disconnect() {
		disconnecting = true;
		disconnectError = null;
		try {
			await apiSend(apiPaths.settingsDrive, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.integrations.driveStatus() });
		} catch (err) {
			disconnectError = err instanceof Error ? err.message : t('settings.drive.disconnectError');
		} finally {
			disconnecting = false;
		}
	}

	async function syncNow() {
		syncing = true;
		syncError = null;
		syncOk = null;
		try {
			await apiSend<DriveSyncResponse>(apiPaths.settingsDriveSync, 'POST');
			syncOk = t('settings.drive.syncQueued');
			await queryClient.invalidateQueries({ queryKey: qs.keys.integrations.driveStatus() });
		} catch (err) {
			syncError = err instanceof Error ? err.message : t('settings.drive.syncError');
		} finally {
			syncing = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.drive.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.drive.title')} description={t('settings.drive.description')} />

	{#if flash}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{t('settings.drive.flash')}
		</div>
	{/if}

	{#if disconnectError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{disconnectError}
		</div>
	{/if}

	{#if syncOk}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{syncOk}
		</div>
	{/if}

	{#if syncError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{syncError}
		</div>
	{/if}

	{#if statusQuery.isPending}
		<p class="text-sm text-text-muted">{t('settings.drive.loading')}</p>
	{:else if statusQuery.isError}
		<p class="text-sm text-danger">{t('settings.drive.loadError')}</p>
	{:else}
		<div class="space-y-4">
			<IntegrationCard
				name={t('settings.drive.card.name')}
				description={t('settings.drive.card.description')}
				status={connected ? 'connected' : 'disconnected'}
				meta={cardMeta(statusQuery.data)}
				actionLabel={connected ? undefined : t('settings.drive.connect')}
				actionHref={connected ? undefined : authorizeHref}
				onDisconnect={connected && !disconnecting ? () => void disconnect() : undefined}
			/>

			{#if connected}
				{#if statusQuery.data?.root_folder_url}
					<p class="text-sm">
						<a
							class="text-accent underline underline-offset-2"
							href={statusQuery.data.root_folder_url}
							target="_blank"
							rel="noreferrer noopener"
						>
							{t('settings.drive.rootFolderLink')}
						</a>
					</p>
				{/if}

				<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
					<h2 class="text-sm font-semibold text-text">{t('settings.drive.lastRunHeading')}</h2>
					<p class="mt-2 text-sm text-text-muted">{lastRunText}</p>
					<p class="mt-3 text-sm text-text-muted">{t('settings.drive.syncHint')}</p>
					<div class="mt-3">
						<Button type="button" size="sm" disabled={syncing} onclick={() => void syncNow()}>
							{syncing ? t('settings.drive.syncing') : t('settings.drive.sync')}
						</Button>
					</div>
				</div>
			{/if}

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">{t('settings.drive.note.heading')}</h2>
				<p class="mt-2 text-sm leading-relaxed text-text-muted">{t('settings.drive.note.body')}</p>
			</div>
		</div>
	{/if}
</div>
