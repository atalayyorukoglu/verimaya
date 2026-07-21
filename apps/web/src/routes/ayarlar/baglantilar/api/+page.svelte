<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
	import IntegrationCard from '$lib/components/IntegrationCard.svelte';
</script>

<svelte:head>
	<title>n8n / API · Ayarlar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title="n8n / API"
		description="Scope'lu API anahtarları ve outbox üzerinden giden webhook'lar."
	/>

	<div class="space-y-4">
		<IntegrationCard
			name="API anahtarları"
			description="Tenant'a özel, scope'lu anahtarlar (ör. patients:read, transactions:write). Anahtar yalnızca oluşturma anında bir kez gösterilir."
			status="planned"
			actionLabel="Anahtar oluştur"
			meta={[
				{ label: 'Aktif anahtar', value: '0' },
				{ label: 'Kimlik doğrulama', value: 'Bearer + scope' }
			]}
		/>

		<IntegrationCard
			name="Giden webhook'lar"
			description="patient.created, appointment.updated gibi olaylar outbox tablosundan imzalı olarak n8n'e iletilir; başarısız teslimat yeniden denenir."
			status="planned"
			meta={[
				{ label: 'Abonelik', value: '0' },
				{ label: 'İmza', value: 'HMAC-SHA256 (planlanan)' }
			]}
		/>

		<p class="text-xs text-text-faint">
			API sözleşmesi <code class="text-text">packages/shared</code> içindeki zod şemalarından üretilir;
			anahtar yönetimi backend ile birlikte (Faz 5) açılacak.
		</p>
	</div>
</div>
