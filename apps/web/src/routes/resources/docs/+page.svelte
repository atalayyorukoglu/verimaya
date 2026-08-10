<script lang="ts">
	import PlaceholderPage from '$lib/components/PlaceholderPage.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>{t('nav.docs.documentTitle')}</title>
</svelte:head>

<PlaceholderPage title={t('nav.docs.title')} description={t('nav.docs.description')} />
