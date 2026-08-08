<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DuplicateScanPanel from '$lib/components/DuplicateScanPanel.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>Çift kayıt · Hastalar · Veri Maya</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title="Hasta çift kayıtları" description={t('patients.duplicates.description')} />
	<DuplicateScanPanel kind="patients" listHref="/patients" listLabel="Hastalar" />
</div>
