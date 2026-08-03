<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		apiPaths,
		type AdConnectionsResponse,
		type AdConnectionStatus,
		type AdMetricsSyncResult,
		type AdProvider
	} from '@verimaya/shared';
	import { apiGet, apiSend, fieldClass, labelClass } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import { PUBLIC_API_URL } from '$lib/env';
	import { formatDate } from '$lib/format';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
	import { Button } from '$lib/components/ui/button';

	const queryClient = useQueryClient();
	const { keys, ready } = useQueryScope();
	const apiOrigin = PUBLIC_API_URL.replace(/\/$/, '');

	const statusQuery = createQuery(() => ({
		queryKey: keys.integrations.adsStatus(),
		queryFn: () => apiGet<AdConnectionsResponse>('/v1/integrations/ads/status'),
		enabled: ready
	}));

	const adsFlash = $derived.by((): AdProvider | null => {
		const raw = page.url.searchParams.get('ads');
		if (raw === 'meta' || raw === 'google') return raw;
		return null;
	});

	const flashLabel = $derived(adsFlash === 'meta' ? 'Meta' : adsFlash === 'google' ? 'Google' : '');

	const anyConnected = $derived(Boolean(statusQuery.data?.items.some((i) => i.connected)));

	function itemFor(provider: AdProvider): AdConnectionStatus | undefined {
		return statusQuery.data?.items.find((i) => i.provider === provider);
	}

	function cardStatus(item: AdConnectionStatus | undefined): 'connected' | 'disconnected' {
		return item?.connected ? 'connected' : 'disconnected';
	}

	function cardMeta(item: AdConnectionStatus | undefined): { label: string; value: string }[] {
		return [
			{
				label: t('settings.ads.statusLabel'),
				value: item?.connected
					? t('settings.ads.statusConnected')
					: t('settings.ads.statusDisconnected')
			},
			{
				label: t('settings.ads.lastSyncLabel'),
				value: item?.last_sync_date ? formatDate(item.last_sync_date) : '—'
			},
			{
				label: t('settings.ads.keyVersionLabel'),
				value: item?.key_version != null ? String(item.key_version) : '—'
			}
		];
	}

	function authorizeHref(provider: AdProvider): string {
		return `${apiOrigin}/v1/integrations/ads/${provider}/authorize`;
	}

	let disconnecting = $state<AdProvider | null>(null);
	let disconnectError = $state<string | null>(null);
	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	let syncOk = $state<string | null>(null);

	let googleCustomerIdDraft = $state('');
	let googleCustomerIdHydrated = $state(false);
	let savingCustomerId = $state(false);
	let customerIdError = $state<string | null>(null);
	let customerIdOk = $state<string | null>(null);

	$effect(() => {
		const google = statusQuery.data?.items.find((i) => i.provider === 'google');
		if (!googleCustomerIdHydrated && google?.connected) {
			googleCustomerIdDraft = google.customer_id ?? '';
			googleCustomerIdHydrated = true;
		}
		if (google && !google.connected) {
			googleCustomerIdDraft = '';
			googleCustomerIdHydrated = false;
		}
	});

	async function disconnect(provider: AdProvider) {
		disconnecting = provider;
		disconnectError = null;
		try {
			await apiSend(`/v1/integrations/ads/${provider}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: keys.integrations.adsStatus() });
		} catch (err) {
			disconnectError = err instanceof Error ? err.message : t('settings.ads.disconnectError');
		} finally {
			disconnecting = null;
		}
	}

	async function saveGoogleCustomerId(e: Event) {
		e.preventDefault();
		savingCustomerId = true;
		customerIdError = null;
		customerIdOk = null;
		try {
			await apiSend(apiPaths.integrationsAdsGoogleCustomerId, 'PATCH', {
				customer_id: googleCustomerIdDraft
			});
			customerIdOk = t('settings.ads.googleCustomerId.saved');
			await queryClient.invalidateQueries({ queryKey: keys.integrations.adsStatus() });
		} catch (err) {
			customerIdError =
				err instanceof Error ? err.message : t('settings.ads.googleCustomerId.error');
		} finally {
			savingCustomerId = false;
		}
	}

	async function syncNow() {
		syncing = true;
		syncError = null;
		syncOk = null;
		try {
			const result = await apiSend<AdMetricsSyncResult>(apiPaths.adMetricsSync, 'POST');
			syncOk = t('settings.ads.syncOk', {
				count: String(result.upserted),
				mode: result.mode
			});
			await queryClient.invalidateQueries({ queryKey: keys.integrations.adsStatus() });
		} catch (err) {
			syncError = err instanceof Error ? err.message : t('settings.ads.syncError');
		} finally {
			syncing = false;
		}
	}
</script>

<svelte:head>
	<title>{t('settings.ads.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader title={t('settings.ads.title')} description={t('settings.ads.description')} />

	{#if adsFlash}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{t('settings.ads.flash', { provider: flashLabel })}
		</div>
	{/if}

	{#if disconnectError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{disconnectError}
		</div>
	{/if}

	{#if customerIdOk}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{customerIdOk}
		</div>
	{/if}

	{#if customerIdError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{customerIdError}
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
		<p class="text-sm text-text-muted">{t('settings.ads.loading')}</p>
	{:else if statusQuery.isError}
		<p class="text-sm text-danger">{t('settings.ads.loadError')}</p>
	{:else}
		{@const metaItem = itemFor('meta')}
		{@const googleItem = itemFor('google')}
		<div class="space-y-4">
			<IntegrationCard
				name={t('settings.ads.meta.name')}
				description={t('settings.ads.meta.description')}
				status={cardStatus(metaItem)}
				meta={cardMeta(metaItem)}
				actionLabel={metaItem?.connected ? undefined : t('settings.ads.connectMeta')}
				actionHref={metaItem?.connected ? undefined : authorizeHref('meta')}
				onDisconnect={metaItem?.connected && disconnecting !== 'meta'
					? () => void disconnect('meta')
					: undefined}
			/>

			<IntegrationCard
				name={t('settings.ads.google.name')}
				description={t('settings.ads.google.description')}
				status={cardStatus(googleItem)}
				meta={cardMeta(googleItem)}
				actionLabel={googleItem?.connected ? undefined : t('settings.ads.connectGoogle')}
				actionHref={googleItem?.connected ? undefined : authorizeHref('google')}
				onDisconnect={googleItem?.connected && disconnecting !== 'google'
					? () => void disconnect('google')
					: undefined}
			/>

			{#if googleItem?.connected}
				<form
					class="rounded-lg border border-border bg-surface p-4 sm:p-5"
					onsubmit={(e) => void saveGoogleCustomerId(e)}
				>
					<label class={labelClass} for="google-customer-id">
						{t('settings.ads.googleCustomerId.label')}
					</label>
					<p class="mt-1 text-sm text-text-muted">{t('settings.ads.googleCustomerId.hint')}</p>
					<input
						id="google-customer-id"
						class="{fieldClass} mt-3"
						inputmode="numeric"
						autocomplete="off"
						placeholder="1234567890"
						bind:value={googleCustomerIdDraft}
					/>
					<div class="mt-3">
						<Button type="submit" size="sm" disabled={savingCustomerId}>
							{savingCustomerId
								? t('settings.ads.googleCustomerId.saving')
								: t('settings.ads.googleCustomerId.save')}
						</Button>
					</div>
				</form>
			{/if}

			{#if anyConnected}
				<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
					<p class="text-sm text-text-muted">{t('settings.ads.syncHint')}</p>
					<div class="mt-3">
						<Button type="button" size="sm" disabled={syncing} onclick={() => void syncNow()}>
							{syncing ? t('settings.ads.syncing') : t('settings.ads.sync')}
						</Button>
					</div>
				</div>
			{/if}

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">{t('settings.ads.dev.heading')}</h2>
				<p class="mt-2 text-sm leading-relaxed text-text-muted">{t('settings.ads.dev.body')}</p>
			</div>

			<p class="text-xs text-text-faint">{t('settings.ads.footnote')}</p>
		</div>
	{/if}
</div>
