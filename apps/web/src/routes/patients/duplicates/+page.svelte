<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DuplicateScanPanel from '$lib/components/DuplicateScanPanel.svelte';
</script>

<svelte:head>
	<title>Çift kayıt · Hastalar · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title="Hasta çift kayıtları"
		description="Aynı telefon, e-posta veya adla birden fazla hasta / lead."
	/>
	<DuplicateScanPanel kind="patients" listHref="/patients" listLabel="Hastalar" />
</div>
