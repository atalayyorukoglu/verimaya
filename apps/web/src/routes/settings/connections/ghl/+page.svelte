<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
</script>

<svelte:head>
	<title>GHL · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="GoHighLevel"
		description="Lead ve iletişim senkronu — webhook-first, alan sahipliği kurallı."
	/>

	<div class="space-y-4">
		<IntegrationCard
			name="GHL hesabı"
			description="Contact ve opportunity webhook'ları kuyruğa yazılır, worker'da işlenir; Verimaya sahibi olduğu alanları GHL'e geri yazar."
			status="disconnected"
			actionLabel="GHL'e bağlan"
			meta={[
				{ label: 'Senkron yönü', value: 'Çift yönlü (alan sahipliğine göre)' },
				{ label: 'Webhook durumu', value: 'Kurulmadı' }
			]}
		/>

		<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
			<h2 class="text-sm font-semibold text-text">Alan sahipliği (planlanan)</h2>
			<ul class="mt-3 space-y-1.5 text-sm text-text-muted">
				<li>· Lead durumu ve pipeline aşaması: <span class="text-text">GHL sahibi</span></li>
				<li>
					· Randevu, finans ve operasyon alanları: <span class="text-text">Verimaya sahibi</span>
				</li>
				<li>· Çakışmada kaynak sahibi kazanır, olay denetim kaydına düşer.</li>
			</ul>
		</div>

		<div class="rounded-lg border border-border bg-surface p-4 sm:p-5">
			<h2 class="text-sm font-semibold text-text">Geliştirme / fixture</h2>
			<p class="mt-2 text-sm leading-relaxed text-text-muted">
				OAuth olmadan gelen GHL webhook'ları kuyrukta işlenir; contact alanları yeterliyse
				tenant içinde hasta upsert edilir (<code class="text-xs">source=ghl</code>). Sync özeti
				<code class="text-xs">jobs</code> ledger'ına yazılır. 6 saatlik
				<code class="text-xs">ghl.reconcile</code> için
				<code class="text-xs">ENABLE_INTEGRATION_SCHEDULERS=true</code> gerekir.
			</p>
		</div>

		<p class="text-xs text-text-faint">
			Gerçek OAuth bağlantısı ve alan bazlı çift yönlü senkron sonraki adım.
		</p>
	</div>
</div>
