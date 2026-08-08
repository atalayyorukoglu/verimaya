<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DuplicateScanPanel from '$lib/components/DuplicateScanPanel.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>{t('patients.duplicates.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title={t('patients.duplicates.title')}
		description={t('patients.duplicates.description')}
	/>
	<DuplicateScanPanel kind="patients" listHref="/patients" listLabel={t('nav.patients')} />
</div>
