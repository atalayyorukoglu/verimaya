<script lang="ts">
	import MayaAiChat from '$lib/components/MayaAiChat.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';
</script>

<svelte:head>
	<title>{t('maya.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<PageHeader title={t('maya.title')} description={t('maya.pageDescription')}>
		{#snippet actions()}
			<span
				class="rounded-md bg-brand-subtle px-2 py-1 text-xs font-medium tracking-wide text-brand-text uppercase"
			>
				{t('maya.mockBadge')}
			</span>
		{/snippet}
	</PageHeader>

	<div
		class="flex h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden rounded-lg border border-border bg-surface"
	>
		<MayaAiChat variant="page" />
	</div>
</div>
