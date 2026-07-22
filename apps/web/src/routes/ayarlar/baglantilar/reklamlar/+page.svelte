<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
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

	<div class="space-y-4">
		<IntegrationCard
			name="Meta Ads"
			description="Lead form gönderimlerini webhook ile alır; kampanya harcamasını günlük çeker ve hasta kaynağıyla eşler."
			status="disconnected"
			actionLabel="Meta'ya bağlan"
			meta={[
				{ label: 'Lead webhook', value: 'Kurulmadı' },
				{ label: 'Harcama senkronu', value: '6 saatte bir (planlanan)' }
			]}
		/>

		<IntegrationCard
			name="Google Ads"
			description="Kampanya harcaması ve dönüşüm verisini çeker; offline conversion geri bildirimi planlanıyor."
			status="planned"
			meta={[
				{ label: 'Harcama senkronu', value: '6 saatte bir (planlanan)' },
				{ label: 'Offline conversion', value: 'Yol haritasında' }
			]}
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
</div>
