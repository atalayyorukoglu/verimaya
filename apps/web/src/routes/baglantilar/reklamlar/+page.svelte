<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
</script>

<svelte:head>
	<title>Reklamlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
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
				{ label: 'Harcama senkronu', value: 'Günlük (planlanan)' }
			]}
		/>

		<IntegrationCard
			name="Google Ads"
			description="Kampanya harcaması ve dönüşüm verisini çeker; offline conversion geri bildirimi planlanıyor."
			status="planned"
			meta={[
				{ label: 'Harcama senkronu', value: 'Günlük (planlanan)' },
				{ label: 'Offline conversion', value: 'Yol haritasında' }
			]}
		/>

		<p class="text-xs text-text-faint">
			Bağlantı sonrası "hasta başına maliyet" Raporlar sayfasında kaynak bazında görünecek.
		</p>
	</div>
</div>
