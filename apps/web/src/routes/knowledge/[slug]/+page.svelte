<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { knowledgeGuideBySlug } from '$lib/knowledge-guides';

	const guide = $derived(knowledgeGuideBySlug(page.params.slug ?? ''));
</script>

<svelte:head>
	<title>
		{guide
			? t('knowledge.guide.documentTitle', { title: t(guide.titleKey) })
			: t('knowledge.notFound.documentTitle')}
	</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<a
		href="/knowledge"
		class="mb-4 inline-flex text-sm font-medium text-text-muted transition-colors hover:text-text"
	>
		{t('knowledge.back')}
	</a>

	{#if guide}
		<PageHeader title={t(guide.titleKey)} description={t(guide.descriptionKey)} />
		<div class="rounded-lg border border-border bg-surface p-6 sm:p-8">
			<p class="text-sm leading-relaxed text-text-muted">{t('knowledge.comingSoon')}</p>
		</div>
	{:else}
		<PageHeader
			title={t('knowledge.notFound.title')}
			description={t('knowledge.notFound.description')}
		/>
	{/if}
</div>
