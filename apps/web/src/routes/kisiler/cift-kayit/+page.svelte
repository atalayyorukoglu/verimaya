<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DuplicateScanPanel from '$lib/components/DuplicateScanPanel.svelte';
</script>

<svelte:head>
	<title>Çift kayıt · Kişiler · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title="Kişi çift kayıtları"
		description="Aynı telefon, e-posta veya adla birden fazla kişi kaydı."
	/>
	<DuplicateScanPanel kind="contacts" listHref="/kisiler" listLabel="Kişiler" />
</div>
