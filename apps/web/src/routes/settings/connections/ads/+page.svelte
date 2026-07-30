<script lang="ts">
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { AdConnectionsResponse, AdConnectionStatus, AdProvider } from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import { PUBLIC_API_URL } from '$lib/env';
	import { formatDate } from '$lib/format';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';

	const queryClient = useQueryClient();
	const apiOrigin = PUBLIC_API_URL.replace(/\/$/, '');

	const statusQuery = createQuery(() => ({
		queryKey: ['integrations', 'ads', 'status'],
		queryFn: () => apiGet<AdConnectionsResponse>('/v1/integrations/ads/status')
	}));

	const adsFlash = $derived.by((): AdProvider | null => {
		const raw = page.url.searchParams.get('ads');
		if (raw === 'meta' || raw === 'google') return raw;
		return null;
	});

	const flashLabel = $derived(adsFlash === 'meta' ? 'Meta' : adsFlash === 'google' ? 'Google' : '');

	function itemFor(provider: AdProvider): AdConnectionStatus | undefined {
		return statusQuery.data?.items.find((i) => i.provider === provider);
	}

	function cardStatus(item: AdConnectionStatus | undefined): 'connected' | 'disconnected' {
		return item?.connected ? 'connected' : 'disconnected';
	}

	function cardMeta(item: AdConnectionStatus | undefined): { label: string; value: string }[] {
		return [
			{
				label: 'Durum',
				value: item?.connected ? 'Bağlı' : 'Bağlı değil'
			},
			{
				label: 'Son senkron',
				value: item?.last_sync_date ? formatDate(item.last_sync_date) : '—'
			},
			{
				label: 'Anahtar sürümü',
				value: item?.key_version != null ? String(item.key_version) : '—'
			}
		];
	}

	function authorizeHref(provider: AdProvider): string {
		return `${apiOrigin}/v1/integrations/ads/${provider}/authorize`;
	}

	let disconnecting = $state<AdProvider | null>(null);
	let disconnectError = $state<string | null>(null);

	async function disconnect(provider: AdProvider) {
		disconnecting = provider;
		disconnectError = null;
		try {
			await apiSend(`/v1/integrations/ads/${provider}`, 'DELETE');
			await queryClient.invalidateQueries({ queryKey: ['integrations', 'ads', 'status'] });
		} catch (err) {
			disconnectError = err instanceof Error ? err.message : 'Bağlantı kesilemedi';
		} finally {
			disconnecting = null;
		}
	}
</script>

<svelte:head>
	<title>Reklamlar · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="Reklamlar"
		description="Meta ve Google Ads harcama/lead verisi — kampanya bazında maliyet raporları için."
	/>

	{#if adsFlash}
		<div
			class="mb-4 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success"
			role="status"
		>
			{flashLabel} bağlantısı tamamlandı.
		</div>
	{/if}

	{#if disconnectError}
		<div class="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
			{disconnectError}
		</div>
	{/if}

	{#if statusQuery.isPending}
		<p class="text-sm text-text-muted">Bağlantı durumu yükleniyor…</p>
	{:else if statusQuery.isError}
		<p class="text-sm text-danger">Bağlantı durumu yüklenemedi.</p>
	{:else}
		{@const metaItem = itemFor('meta')}
		{@const googleItem = itemFor('google')}
		<div class="space-y-4">
			<IntegrationCard
				name="Meta Ads"
				description="Lead form gönderimlerini webhook ile alır; kampanya harcamasını günlük çeker ve hasta kaynağıyla eşler."
				status={cardStatus(metaItem)}
				meta={cardMeta(metaItem)}
				actionLabel={metaItem?.connected ? undefined : "Meta'ya bağlan"}
				actionHref={metaItem?.connected ? undefined : authorizeHref('meta')}
				onDisconnect={metaItem?.connected && disconnecting !== 'meta'
					? () => void disconnect('meta')
					: undefined}
			/>

			<IntegrationCard
				name="Google Ads"
				description="Kampanya harcaması ve dönüşüm verisini çeker; offline conversion geri bildirimi planlanıyor."
				status={cardStatus(googleItem)}
				meta={cardMeta(googleItem)}
				actionLabel={googleItem?.connected ? undefined : "Google'a bağlan"}
				actionHref={googleItem?.connected ? undefined : authorizeHref('google')}
				onDisconnect={googleItem?.connected && disconnecting !== 'google'
					? () => void disconnect('google')
					: undefined}
			/>

			<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
				<h2 class="text-sm font-semibold text-text">Geliştirme / demo verisi</h2>
				<p class="mt-2 text-sm leading-relaxed text-text-muted">
					OAuth bağlantısı olmadan <code class="text-xs">ad_metrics.sync</code> işi tenant için
					birkaç örnek satır yazar; <code class="text-xs">GET /v1/ad-metrics</code> bunları döner.
					Periyodik 6 saatlik kuyruk için API'de
					<code class="text-xs">ENABLE_INTEGRATION_SCHEDULERS=true</code> gerekir (yerelde varsayılan
					kapalı).
				</p>
			</div>

			<p class="text-xs text-text-faint">
				Bağlantı sonrası "hasta başına maliyet" Raporlar sayfasında kaynak bazında görünecek.
			</p>
		</div>
	{/if}
</div>
