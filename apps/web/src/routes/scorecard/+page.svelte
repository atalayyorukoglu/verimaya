<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		SCORECARD_BAND_IDS,
		SCORECARD_CRITERIA,
		SCORECARD_DIMENSIONS,
		apiPaths,
		criterionDisplayText,
		isCriterionInDenominator,
		type ScorecardBandId,
		type SetupAnswers
	} from '@verimaya/shared';
	import { apiGet, apiSend } from '$lib/api';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	type CurrentDto = {
		profile: {
			id: string;
			band: ScorecardBandId;
			setup_s1: boolean;
			setup_s2: boolean;
			setup_s3: boolean;
			locked_at: string | null;
		} | null;
		assessment: {
			id: string;
			is_baseline: boolean;
			incomparability_warning: string | null;
			completed_at: string | null;
		} | null;
		answers: Array<{
			criterion_id: string;
			score: number | null;
			na_declared: boolean;
			evidence_note: string | null;
			source: string;
		}>;
		stats: {
			denominator: number;
			zero_count: number;
			scored_count: number;
			percentage: number | null;
			maturity: 'baslangic' | 'parcali' | 'tutarli' | 'olgun' | null;
		} | null;
	};

	const queryClient = useQueryClient();

	const currentQuery = createQuery(() => ({
		queryKey: ['scorecard', 'current'],
		queryFn: () => apiGet<CurrentDto>(apiPaths.scorecardCurrent)
	}));

	let band = $state<ScorecardBandId>('5-15');
	let setupS1 = $state(false);
	let setupS2 = $state(false);
	let setupS3 = $state(false);
	let setupBusy = $state(false);
	let autoBusy = $state(false);
	let completeBusy = $state(false);
	let actionError = $state<string | null>(null);

	const maturityKey = $derived.by((): MessageKey | null => {
		const m = currentQuery.data?.stats?.maturity;
		if (!m) return null;
		return `scorecard.maturity.${m}` as MessageKey;
	});

	const zerosLine = $derived.by(() => {
		const stats = currentQuery.data?.stats;
		if (!stats) return '';
		return t('scorecard.zeros.primary')
			.replace('{zeros}', String(stats.zero_count))
			.replace('{denom}', String(stats.denominator));
	});

	function setupFromProfile(p: NonNullable<CurrentDto['profile']>): SetupAnswers {
		return { S1: p.setup_s1, S2: p.setup_s2, S3: p.setup_s3 };
	}

	async function createAndStart() {
		setupBusy = true;
		actionError = null;
		try {
			await apiSend(apiPaths.scorecardProfile, 'POST', {
				band,
				setup_s1: setupS1,
				setup_s2: setupS2,
				setup_s3: setupS3
			});
			await apiSend(apiPaths.scorecardAssessments, 'POST');
			await queryClient.invalidateQueries({ queryKey: ['scorecard', 'current'] });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('scorecard.loadError');
		} finally {
			setupBusy = false;
		}
	}

	async function startAssessment() {
		actionError = null;
		try {
			await apiSend(apiPaths.scorecardAssessments, 'POST');
			await queryClient.invalidateQueries({ queryKey: ['scorecard', 'current'] });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('scorecard.loadError');
		}
	}

	async function runAutoFill() {
		const assessmentId = currentQuery.data?.assessment?.id;
		if (!assessmentId) return;
		autoBusy = true;
		actionError = null;
		try {
			await apiSend(apiPaths.scorecardAssessmentAutoFill(assessmentId), 'POST');
			await queryClient.invalidateQueries({ queryKey: ['scorecard', 'current'] });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('scorecard.loadError');
		} finally {
			autoBusy = false;
		}
	}

	async function completeAssessment() {
		const assessmentId = currentQuery.data?.assessment?.id;
		if (!assessmentId) return;
		completeBusy = true;
		actionError = null;
		try {
			await apiSend(apiPaths.scorecardAssessmentComplete(assessmentId), 'POST');
			await queryClient.invalidateQueries({ queryKey: ['scorecard', 'current'] });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('scorecard.loadError');
		} finally {
			completeBusy = false;
		}
	}

	async function setScore(criterionId: string, score: number) {
		const assessmentId = currentQuery.data?.assessment?.id;
		if (!assessmentId || currentQuery.data?.assessment?.completed_at) return;
		actionError = null;
		try {
			await apiSend(apiPaths.scorecardAssessmentAnswers(assessmentId), 'PUT', {
				criterion_id: criterionId,
				score,
				na_declared: false
			});
			await queryClient.invalidateQueries({ queryKey: ['scorecard', 'current'] });
		} catch (err) {
			actionError = err instanceof Error ? err.message : t('scorecard.loadError');
		}
	}

	function answerMap(data: CurrentDto) {
		return new Map(data.answers.map((a) => [a.criterion_id, a]));
	}
</script>

<div class="mx-auto max-w-4xl min-w-0">
	<PageHeader title={t('scorecard.title')} description={t('scorecard.description')}>
		{#snippet actions()}
			{#if currentQuery.data?.assessment && !currentQuery.data.assessment.completed_at}
				<Button variant="outline" disabled={autoBusy} onclick={runAutoFill}>
					{autoBusy ? t('scorecard.autoFilling') : t('scorecard.autoFill')}
				</Button>
				<Button disabled={completeBusy} onclick={completeAssessment}>
					{completeBusy ? t('scorecard.completing') : t('scorecard.complete')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if currentQuery.isPending}
		<p class="text-sm text-text-muted">{t('scorecard.loading')}</p>
	{:else if currentQuery.isError}
		<p class="text-sm text-destructive">{t('scorecard.loadError')}</p>
	{:else if !currentQuery.data?.profile}
		<section class="rounded-lg border border-border bg-surface p-5 space-y-4">
			<h2 class="text-base font-semibold text-text">{t('scorecard.setup.title')}</h2>
			<label class="block text-sm text-text">
				<span class="text-text-muted">{t('scorecard.setup.band')}</span>
				<select
					class="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
					bind:value={band}
				>
					{#each SCORECARD_BAND_IDS as b (b)}
						<option value={b}>{b}</option>
					{/each}
				</select>
			</label>
			{#each [
				{ key: 's1' as const, get: () => setupS1, set: (v: boolean) => (setupS1 = v), label: 'scorecard.setup.s1' as MessageKey },
				{ key: 's2' as const, get: () => setupS2, set: (v: boolean) => (setupS2 = v), label: 'scorecard.setup.s2' as MessageKey },
				{ key: 's3' as const, get: () => setupS3, set: (v: boolean) => (setupS3 = v), label: 'scorecard.setup.s3' as MessageKey }
			] as q (q.key)}
				<fieldset class="text-sm">
					<legend class="text-text-muted">{t(q.label)}</legend>
					<div class="mt-2 flex gap-3">
						<label class="inline-flex items-center gap-2">
							<input
								type="radio"
								name={q.key}
								checked={q.get() === true}
								onchange={() => q.set(true)}
							/>
							{t('scorecard.setup.yes')}
						</label>
						<label class="inline-flex items-center gap-2">
							<input
								type="radio"
								name={q.key}
								checked={q.get() === false}
								onchange={() => q.set(false)}
							/>
							{t('scorecard.setup.no')}
						</label>
					</div>
				</fieldset>
			{/each}
			<Button disabled={setupBusy} onclick={createAndStart}>
				{setupBusy ? t('scorecard.setup.creating') : t('scorecard.setup.create')}
			</Button>
			{#if actionError}
				<p class="text-sm text-destructive">{actionError}</p>
			{/if}
		</section>
	{:else}
		{@const data = currentQuery.data}
		{@const profile = data.profile!}
		{@const setup = setupFromProfile(profile)}
		{@const answers = answerMap(data)}

		{#if data.assessment?.is_baseline && data.assessment.incomparability_warning}
			<p
				class="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text"
				role="status"
			>
				{data.assessment.incomparability_warning}
			</p>
		{/if}

		<!-- 1. Primary: zeros -->
		<section class="mb-6 rounded-lg border border-border bg-surface p-6">
			<p class="text-xs font-medium uppercase tracking-wide text-text-muted">
				{t('scorecard.zeros.heading')}
			</p>
			<p class="mt-2 text-3xl font-semibold tracking-tight text-text sm:text-4xl">
				{zerosLine}
			</p>
			<p class="mt-2 text-sm text-text-muted">{t('scorecard.zeros.hint')}</p>
		</section>

		<!-- 2. Dimensions summary -->
		<section class="mb-6">
			<h2 class="mb-3 text-sm font-semibold text-text">{t('scorecard.dimension.changeHeading')}</h2>
			<ul class="grid gap-2 sm:grid-cols-2">
				{#each SCORECARD_DIMENSIONS as dim (dim.id)}
					{@const dimCriteria = SCORECARD_CRITERIA.filter((c) => c.dimension === dim.id)}
					{@const scored = dimCriteria.filter((c) => {
						const a = answers.get(c.id);
						return (
							isCriterionInDenominator(c, profile.band, setup) &&
							a &&
							!a.na_declared &&
							a.score !== null
						);
					})}
					{@const zeros = scored.filter((c) => answers.get(c.id)?.score === 0).length}
					<li class="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
						<span class="font-medium text-text">{dim.label}</span>
						<span class="ml-2 text-text-muted">
							{t('scorecard.dimension.zeros')
								.replace('{zeros}', String(zeros))
								.replace('{scored}', String(scored.length))}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- 3. Secondary: percentage (small) -->
		<section class="mb-8 rounded-lg border border-border bg-surface px-4 py-3">
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span class="text-xs font-medium uppercase tracking-wide text-text-muted">
					{t('scorecard.percentage.label')}
				</span>
				<span class="text-sm font-medium text-text">
					{data.stats?.percentage != null ? `${data.stats.percentage}%` : '—'}
				</span>
				{#if maturityKey}
					<span class="text-sm text-text">{t(maturityKey)}</span>
				{/if}
				<span class="text-xs text-text-muted">
					{t('scorecard.headcount')}: {profile.band}
				</span>
			</div>
			<p class="mt-2 text-xs text-text-muted">{t('scorecard.percentage.warning')}</p>
			<p class="mt-1 text-xs text-text-muted">{t('scorecard.maturity.temporary')}</p>
		</section>

		{#if !data.assessment}
			<Button onclick={startAssessment}>{t('scorecard.startAssessment')}</Button>
		{:else}
			{#if data.answers.length === 0}
				<p class="mb-4 text-sm text-text-muted">{t('scorecard.emptyAnswers')}</p>
			{/if}

			<ul class="space-y-3">
				{#each SCORECARD_CRITERIA as criterion (criterion.id)}
					{@const inDenom = isCriterionInDenominator(criterion, profile.band, setup)}
					{@const kind = criterion.bandApplicability[profile.band]}
					{@const ans = answers.get(criterion.id)}
					{@const showNa = !inDenom || ans?.na_declared === true || kind === 'na'}
					<li class="rounded-lg border border-border bg-surface p-4">
						<div class="flex flex-wrap items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<p class="text-xs font-medium text-text-muted">{criterion.id}</p>
								<p class="mt-1 text-sm text-text">
									{criterionDisplayText(criterion, profile.band)}
								</p>
								<div class="mt-2 flex flex-wrap gap-2">
									{#if ans?.source === 'auto'}
										<span
											class="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted"
										>
											{t('scorecard.autoFilledBadge')}
										</span>
									{/if}
									{#if showNa}
										<span
											class="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-muted"
										>
											{t('scorecard.naBadge')}
										</span>
									{/if}
								</div>
								{#if ans?.evidence_note}
									<p class="mt-2 break-words text-xs text-text-muted">{ans.evidence_note}</p>
								{/if}
								{#if criterion.id === '7.6'}
									<a
										href="/settings/ai"
										class="mt-2 inline-block text-sm font-medium text-brand hover:underline"
									>
										{t('scorecard.disclosureLink')}
									</a>
								{/if}
							</div>
							{#if inDenom && !data.assessment.completed_at}
								<div class="shrink-0">
									<p class="mb-1 text-[10px] uppercase tracking-wide text-text-muted">
										{t('scorecard.scoreLabel')}
									</p>
									<div class="flex gap-1">
										{#each [0, 1, 2, 3, 4] as s (s)}
											<button
												type="button"
												class="h-8 w-8 rounded border text-xs {ans?.score === s && !ans?.na_declared
													? 'border-brand bg-brand/10 font-semibold text-text'
													: 'border-border text-text-muted hover:border-brand/50'}"
												onclick={() => setScore(criterion.id, s)}
											>
												{s}
											</button>
										{/each}
									</div>
								</div>
							{:else if inDenom && ans?.score !== null && ans?.score !== undefined}
								<p class="text-sm font-medium text-text">{ans.score}</p>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if actionError}
			<p class="mt-4 text-sm text-destructive">{actionError}</p>
		{/if}
	{/if}
</div>
