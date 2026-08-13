<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type GhlConnectionStatus,
		type GhlReconcileTriggerResult
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { PUBLIC_API_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const qs = useQueryScope();
	const apiOrigin = PUBLIC_API_URL.replace(/\/$/, '');
	const authorizeHref = `${apiOrigin}/v1/integrations/ghl/authorize`;

	const statusQuery = createQuery(() => ({
		queryKey: qs.keys.integrations.ghlStatus(),
		queryFn: () => apiGet<GhlConnectionStatus>(apiPaths.integrationsGhlStatus),
		enabled: qs.ready
	}));

	const flashConnected = $derived(page.url.searchParams.get('ghl') === 'connected');

	const cardStatus = $derived(
		statusQuery.data?.connected ? ('connected' as const) : ('disconnected' as const)
	);

	const cardMeta = $derived.by((): { label: string; value: string }[] => {
		const data = statusQuery.data;
		return [
			{
				label: t('settings.ghl.statusLabel'),
				value: data?.connected
					? t('settings.ghl.statusConnected')
					: t('settings.ghl.statusDisconnected')
			},
			{
				label: t('settings.ghl.locationLabel'),
				value: data?.location_id ?? '—'
			},
			{
				label: t('settings.ghl.userTypeLabel'),
				value: data?.user_type ?? '—'
			},
			{
				label: t('settings.ghl.keyVersionLabel'),
				value: data?.key_version != null ? String(data.key_version) : '—'
			}
		];
	});

	let disconnecting = $state(false);
	let disconnectError = $state<string | null>(null);
	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	let syncOk = $state<string | null>(null);

	async function disconnect() {
		disconnecting = true;
		disconnectError = null;
		try {
			await apiSend(apiPaths.integrationsGhl, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: qs.keys.integrations.ghlStatus() });
		} catch (err) {
			disconnectError = err instanceof Error ? err.message : t('settings.ghl.disconnectError');
		} finally {
			disconnecting = false;
		}
	}

	async function syncNow() {
		syncing = true;
		syncError = null;
		syncOk = null;
		try {
			const result = await apiSend<GhlReconcileTriggerResult>(
				apiPaths.integrationsGhlReconcile,
				'POST'
			);
			if (result.status === 'queued') {
				syncOk = result.already_queued
					? t('settings.ghl.syncQueuedAlready')
					: t('settings.ghl.syncQueued');
			} else {
				syncOk = t('settings.ghl.syncOk', {
					scanned: String(result.scanned),
					created: String(result.created),
					updated: String(result.updated),
					mode: result.mode
				});
			}
		} catch (err) {
			syncError = err instanceof Error ? err.message : t('settings.ghl.syncError');
		} finally {
			syncing = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.ghl.title')} · {t('nav.settings')} · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.ghl.title')} description={t('settings.ghl.description')} />

	{#if flashConnected}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{t('settings.ghl.flash')}
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
		<p class="text-sm text-text-muted">{t('settings.ghl.loading')}</p>
	{:else if statusQuery.isError}
		<p class="text-sm text-danger">{t('settings.ghl.loadError')}</p>
	{:else}
		<div class="space-y-4">
			<IntegrationCard
				name={t('settings.ghl.card.name')}
				description={t('settings.ghl.card.description')}
				status={cardStatus}
				meta={cardMeta}
				actionLabel={statusQuery.data?.connected ? undefined : t('settings.ghl.connect')}
				actionHref={statusQuery.data?.connected ? undefined : authorizeHref}
				onDisconnect={statusQuery.data?.connected && !disconnecting
					? () => void disconnect()
					: undefined}
			/>

			{#if statusQuery.data?.connected}
				<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
					<p class="text-sm text-text-muted">{t('settings.ghl.syncHint')}</p>
					<div class="mt-3">
						<Button type="button" size="sm" disabled={syncing} onclick={() => void syncNow()}>
							{syncing ? t('settings.ghl.syncing') : t('settings.ghl.sync')}
						</Button>
					</div>
				</div>
			{/if}

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">{t('settings.ghl.ownership.heading')}</h2>
				<ul class="mt-3 space-y-1.5 text-sm text-text-muted">
					<li>· {t('settings.ghl.ownership.lead')}</li>
					<li>· {t('settings.ghl.ownership.ops')}</li>
					<li>· {t('settings.ghl.ownership.conflict')}</li>
				</ul>
			</div>

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">{t('settings.ghl.dev.heading')}</h2>
				<p class="mt-2 text-sm leading-relaxed text-text-muted">
					{t('settings.ghl.dev.body')}
				</p>
			</div>

			<p class="text-xs text-text-faint">{t('settings.ghl.footnote')}</p>
		</div>
	{/if}
</div>
