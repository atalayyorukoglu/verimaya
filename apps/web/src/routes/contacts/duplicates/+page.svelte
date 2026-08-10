<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DuplicateScanPanel from '$lib/components/DuplicateScanPanel.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>{t('contacts.duplicates.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader
		title={t('contacts.duplicates.title')}
		description={t('contacts.duplicates.description')}
	/>
	<DuplicateScanPanel listHref="/contacts" listLabel={t('contacts.list.title')} />
</div>
