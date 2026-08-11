<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { knowledgeGuides } from '$lib/knowledge-guides';
</script>

<svelte:head>
	<title>{t('nav.resources.documentTitle')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('nav.resources.title')} description={t('nav.resources.description')} />

	<ul class="grid gap-3 sm:grid-cols-2">
		{#each knowledgeGuides as guide (guide.slug)}
			<li class="flex min-h-0">
				<a
					href="/knowledge/{guide.slug}"
					class="flex h-full min-h-[7rem] w-full items-start gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-2/60"
				>
					<div class="min-w-0 flex-1">
						<h2 class="font-medium text-text">{t(guide.titleKey)}</h2>
						<p class="mt-0.5 text-sm text-text-muted">{t(guide.descriptionKey)}</p>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</div>
