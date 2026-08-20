<script lang="ts">
	import { resolve } from '$app/paths';
	import { t } from '$lib/i18n/locale.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
</script>

<svelte:head>
	<title>{t('reports.interventions.title')} · {t('reports.title')} · Verimaya</title>
</svelte:head>

<div class="mx-auto max-w-4xl min-w-0">
	<div class="mb-4">
		<a href={resolve('/reports')} class="text-sm font-medium text-brand hover:underline">
			← {t('reports.title')}
		</a>
	</div>

	<PageHeader title={t('reports.interventions.title')}>
		{#snippet actions()}
			<StatusBadge label={t('reports.interventions.soon')} tone="neutral" />
		{/snippet}
	</PageHeader>

	<div class="rounded-lg border border-border bg-surface p-4 sm:p-6">
		<p class="text-sm leading-relaxed text-text-muted">{t('reports.interventions.intro')}</p>

		<p class="mt-5 text-sm font-medium text-text">{t('reports.interventions.exampleHeading')}</p>
		<p class="mt-2 text-sm leading-relaxed text-text">
			{t('reports.interventions.exampleScenario')}
		</p>
		<p class="mt-3 text-sm text-text">{t('reports.interventions.exampleQuestion')}</p>
		<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-text-muted">
			<li>{t('reports.interventions.exampleOptionRate')}</li>
			<li>{t('reports.interventions.exampleOptionChannel')}</li>
			<li>{t('reports.interventions.exampleOptionFollowup')}</li>
		</ul>
	</div>
</div>
