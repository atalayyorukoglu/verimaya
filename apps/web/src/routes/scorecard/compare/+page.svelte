<script lang="ts">
	import { page } from '$app/state';
	import { createQuery } from '@tanstack/svelte-query';
	import { apiPaths } from '@verimaya/shared';
	import { apiGet } from '$lib/api';
	import { useQueryScope } from '$lib/query-scope.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t } from '$lib/i18n/locale.svelte';

	type CompareDto =
		| {
				comparable: true;
				closed_zeros: number;
				previous_zero_count: number;
				current_zero_count: number;
				primary_message: string;
				transitions: Array<{
					criterion_id: string;
					previous_score: number | null;
					current_score: number | null;
					closed_zero: boolean;
				}>;
		  }
		| {
				comparable: false;
				warning: string;
		  };

	const previousId = $derived(page.url.searchParams.get('previous') ?? '');
	const currentId = $derived(page.url.searchParams.get('current') ?? '');
	const { keys, ready } = useQueryScope();

	const compareQuery = createQuery(() => ({
		queryKey: keys.scorecard.compare(previousId, currentId),
		enabled: Boolean(previousId && currentId) && ready,
		queryFn: () => apiGet<CompareDto>(apiPaths.scorecardCompare(previousId, currentId))
	}));

	const primaryLine = $derived.by(() => {
		const data = compareQuery.data;
		if (!data || !data.comparable) return '';
		return t('scorecard.compare.primary')
			.replace('{closed}', String(data.closed_zeros))
			.replace('{prev}', String(data.previous_zero_count));
	});
</script>

<div class="mx-auto max-w-3xl min-w-0">
	<PageHeader title={t('scorecard.compare.title')} description={t('scorecard.compare.description')}>
		{#snippet actions()}
			<a href="/scorecard" class="text-sm font-medium text-brand hover:underline">
				{t('scorecard.compare.back')}
			</a>
		{/snippet}
	</PageHeader>

	{#if !previousId || !currentId}
		<p class="text-sm text-text-muted">{t('scorecard.compare.loadError')}</p>
	{:else if compareQuery.isPending}
		<p class="text-sm text-text-muted">{t('scorecard.compare.loading')}</p>
	{:else if compareQuery.isError}
		<p class="text-sm text-destructive">{t('scorecard.compare.loadError')}</p>
	{:else if compareQuery.data && !compareQuery.data.comparable}
		<section class="rounded-lg border border-border bg-surface p-5" role="alert">
			<h2 class="text-base font-semibold text-text">{t('scorecard.compare.blocked')}</h2>
			<p class="mt-2 text-sm text-text">{compareQuery.data.warning}</p>
		</section>
	{:else if compareQuery.data?.comparable}
		{@const data = compareQuery.data}
		<section class="mb-6 rounded-lg border border-border bg-surface p-6">
			<p class="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
				{primaryLine}
			</p>
			<p class="mt-2 text-sm text-text-muted">
				{data.previous_zero_count} → {data.current_zero_count}
			</p>
		</section>

		<ul class="space-y-2">
			{#each data.transitions.filter((x) => x.closed_zero || x.previous_score !== x.current_score) as row (row.criterion_id)}
				<li class="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<span class="font-medium text-text">{row.criterion_id}</span>
						<span class="text-text-muted">
							{row.previous_score ?? '—'} → {row.current_score ?? '—'}
						</span>
					</div>
					{#if row.closed_zero}
						<span
							class="mt-2 inline-block rounded border border-border px-1.5 py-0.5 text-[10px] tracking-wide text-text-muted uppercase"
						>
							{t('scorecard.compare.closedBadge')}
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
