<script lang="ts">
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import SettingsBackLink from '$lib/components/SettingsBackLink.svelte';
</script>

<svelte:head>
	<title>{t('settings.importExport.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<SettingsBackLink />
	<PageHeader
		title={t('settings.importExport.title')}
		description={t('settings.importExport.description')}
	/>
	<div class="rounded-lg border border-border bg-surface p-6 text-center sm:p-8">
		<p class="text-sm font-medium text-text">Faz 8’de</p>
		<p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-muted">
			{t('settings.importExport.body')}
		</p>
		<a
			href="/features"
			class="mt-5 inline-flex h-9 items-center rounded-[6px] bg-surface-2 px-4 text-sm font-medium text-text hover:bg-border"
		>
			{t('settings.importExport.cta')}
		</a>
	</div>
</div>
