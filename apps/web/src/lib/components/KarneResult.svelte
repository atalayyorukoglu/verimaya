<script lang="ts">
	import type { KarneResult } from '$lib/karne/score';
	import type { KarneQuestion, IntakeBandId, IntakeEuId } from '$lib/karne/questions';
	import { karneQuestions } from '$lib/karne/questions';
	import { EMAIL_GATE_POSITION, KARNE_LEADS_ENABLED } from '$lib/karne/config';
	import { initialGateUnlocked, showsBlockingGate, showsInlineCapture } from '$lib/karne/gate';
	import KarneEmailCapture from '$lib/components/KarneEmailCapture.svelte';
	import { t } from '$lib/i18n/locale.svelte';

	let {
		result,
		band,
		eu
	}: {
		result: KarneResult;
		band: IntakeBandId;
		eu: IntakeEuId;
	} = $props();

	const totalAsked = karneQuestions.length;
	/** before-result: unlock after successful lead submit. Disabled leads unlock immediately. */
	let gateUnlocked = $state(initialGateUnlocked(KARNE_LEADS_ENABLED, EMAIL_GATE_POSITION));

	const zeroSummary = $derived(
		t('karne.result.zeroSummary', {
			total: totalAsked,
			zeros: result.zeroCount
		})
	);

	function formatStrongRefs(questions: KarneQuestion[]): string {
		const labels = questions.map((q) => q.id.toUpperCase());
		if (labels.length === 1) return labels[0]!;
		if (labels.length === 2) {
			return t('karne.result.strongRefs.two', {
				first: labels[0]!,
				second: labels[1]!
			});
		}
		return t('karne.result.strongRefs.many', {
			leading: labels.slice(0, -1).join(', '),
			last: labels.at(-1)!
		});
	}

	function isEuCritical(q: KarneQuestion): boolean {
		return result.euExposure && (q.id === 's4' || q.id === 's8');
	}
</script>

{#if showsBlockingGate(KARNE_LEADS_ENABLED, EMAIL_GATE_POSITION, gateUnlocked)}
	<section class="space-y-10" aria-labelledby="karne-gate-heading">
		<div>
			<p class="text-sm font-medium text-brand">{t('karne.result.gate.eyebrow')}</p>
			<h1
				id="karne-gate-heading"
				class="mt-3 text-[clamp(1.35rem,3.5vw,1.75rem)] font-semibold tracking-tight text-text"
			>
				{t('karne.result.gate.title')}
			</h1>
			<p class="mt-3 text-sm leading-relaxed text-text-muted">
				{t('karne.result.gate.description')}
			</p>
		</div>
		<div class="border-t border-border pt-8">
			<KarneEmailCapture {band} {eu} {result} onsuccess={() => (gateUnlocked = true)} />
		</div>
	</section>
{:else}
	<section class="space-y-10" aria-labelledby="karne-result-heading">
		<div>
			<p class="text-sm font-medium text-brand">{t('karne.result.eyebrow')}</p>
			<h1
				id="karne-result-heading"
				class="mt-3 text-[clamp(1.35rem,3.5vw,1.75rem)] font-semibold tracking-tight text-text"
			>
				{zeroSummary}
			</h1>
		</div>

		{#if result.topThreeWeak.length > 0}
			<div>
				<h2 class="text-sm font-semibold tracking-tight text-text">
					{t('karne.result.weakHeading')}
				</h2>
				<ul class="mt-4 space-y-3">
					{#each result.topThreeWeak as q (q.id)}
						<li
							class="rounded-[8px] border border-border bg-surface px-4 py-3 text-sm leading-relaxed text-text {isEuCritical(
								q
							)
								? 'border-danger/40 text-danger'
								: ''}"
						>
							{q.weakLabel}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.strongQuestions.length > 0}
			<div>
				<h2 class="text-sm font-semibold tracking-tight text-text">
					{t('karne.result.strongHeading')}
				</h2>
				<p class="mt-3 text-sm leading-relaxed text-text-muted">
					{t('karne.result.strongStatus', {
						refs: formatStrongRefs(result.strongQuestions)
					})}
				</p>
				<ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-text">
					{#each result.strongQuestions as q (q.id)}
						<li>{q.title}</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if result.euExposure}
			<p class="border-t border-border pt-8 text-sm leading-relaxed text-text">
				{t('karne.result.euNoticePrefix')}
				<strong class="font-semibold">{t('karne.result.euEffectiveDate')}</strong>{t(
					'karne.result.euNoticeSuffix'
				)}
			</p>
		{/if}

		{#if showsInlineCapture(KARNE_LEADS_ENABLED, EMAIL_GATE_POSITION)}
			<div class="border-t border-border pt-8">
				<KarneEmailCapture {band} {eu} {result} />
			</div>
		{/if}

		<div class="border-t border-border pt-8">
			<p class="text-sm leading-relaxed text-text-muted">
				{t('karne.result.productBlurb')}
			</p>
			<div class="mt-4 flex flex-col gap-3 sm:flex-row">
				<a
					href="/"
					class="inline-flex h-11 items-center justify-center rounded-[6px] border border-border bg-surface px-5 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{t('karne.result.backToShowcase')}
				</a>
				<a
					href="/login"
					class="inline-flex h-11 items-center justify-center rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{t('karne.result.demoLogin')}
				</a>
			</div>
		</div>
	</section>
{/if}
