<script lang="ts">
	import PlaceholderPage from '$lib/components/PlaceholderPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>{t('nav.aiPrep.documentTitle')}</title>
</svelte:head>

<PlaceholderPage title={t('nav.aiPrep.title')} description={t('nav.aiPrep.description')} />
