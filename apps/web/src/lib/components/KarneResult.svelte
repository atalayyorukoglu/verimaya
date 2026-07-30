<script lang="ts">
	import type { KarneResult } from '$lib/karne/score';
	import type { KarneQuestion } from '$lib/karne/questions';
	import { karneQuestions } from '$lib/karne/questions';

	let { result }: { result: KarneResult } = $props();

	const totalAsked = karneQuestions.length;

	const zeroSummary = $derived(
		`${totalAsked} sorudan ${result.zeroCount}'inde kanıtınız yok.`
	);

	function formatStrongRefs(questions: KarneQuestion[]): string {
		const labels = questions.map((q) => q.id.toUpperCase());
		if (labels.length === 1) return labels[0]!;
		if (labels.length === 2) return `${labels[0]} ve ${labels[1]}`;
		return `${labels.slice(0, -1).join(', ')} ve ${labels.at(-1)}`;
	}

	function isEuCritical(q: KarneQuestion): boolean {
		return result.euExposure && (q.id === 's4' || q.id === 's8');
	}
</script>

<section class="space-y-10" aria-labelledby="karne-result-heading">
	<div>
		<p class="text-sm font-medium text-brand">Sonuç</p>
		<h1
			id="karne-result-heading"
			class="mt-3 text-[clamp(1.35rem,3.5vw,1.75rem)] font-semibold tracking-tight text-text"
		>
			{zeroSummary}
		</h1>
	</div>

	{#if result.topThreeWeak.length > 0}
		<div>
			<h2 class="text-sm font-semibold tracking-tight text-text">En kritik üçü</h2>
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
			<h2 class="text-sm font-semibold tracking-tight text-text">İyi çıkan alan</h2>
			<p class="mt-3 text-sm leading-relaxed text-text-muted">
				{formatStrongRefs(result.strongQuestions)}'te durumunuz iyi:
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
			İngiltere/AB'de yaşayan hastalarınız olduğu için yapay zeka şeffaflığı yükümlülüğü
			<strong class="font-semibold">2 Ağustos 2026</strong>'dan itibaren sizi kapsıyor.
		</p>
	{/if}
</section>
