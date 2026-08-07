<script lang="ts">
	import type { IntakeBandId, IntakeEuId } from '$lib/karne/questions';
	import type { KarneResult } from '$lib/karne/score';
	import { submitKarneLead } from '$lib/karne/telemetry';
	import { t } from '$lib/i18n/locale.svelte';

	let {
		band,
		eu,
		result,
		onsuccess
	}: {
		band: IntakeBandId;
		eu: IntakeEuId;
		result: KarneResult;
		onsuccess?: () => void;
	} = $props();

	let email = $state('');
	let consent = $state(false);
	/** Honeypot — hidden from humans. */
	let website = $state('');
	let submitting = $state(false);
	let done = $state(false);
	let emailed = $state(false);
	let errorMsg = $state<string | null>(null);

	const canSubmit = $derived(
		!submitting && !done && consent && email.trim().length > 0 && email.includes('@')
	);

	async function onSubmit(e: Event) {
		e.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		errorMsg = null;
		const submitResult = await submitKarneLead({
			email,
			consent: true,
			website,
			band,
			eu_exposure: eu,
			summary: {
				zero_count: result.zeroCount,
				answered_count: result.answeredCount,
				top_weak: result.topThreeWeak.map((q) => q.weakLabel),
				strong_titles: result.strongQuestions.map((q) => q.title),
				eu_exposure: result.euExposure
			}
		});
		submitting = false;
		if (submitResult.ok) {
			done = true;
			emailed = submitResult.emailed;
			onsuccess?.();
			return;
		}
		errorMsg =
			submitResult.reason === 'validation'
				? t('karne.email.errorValidation')
				: t('karne.email.errorNetwork');
	}
</script>

<section class="space-y-4" aria-labelledby="karne-email-heading">
	<h2 id="karne-email-heading" class="text-sm font-semibold tracking-tight text-text">
		{t('karne.email.heading')}
	</h2>
	<p class="text-sm leading-relaxed text-text-muted">
		{t('karne.email.blurb')}
	</p>

	{#if done}
		<p class="text-sm font-medium text-text" role="status">
			{emailed ? t('karne.email.successSent') : t('karne.email.successSaved')}
		</p>
	{:else}
		<form class="relative space-y-4" onsubmit={onSubmit}>
			<!-- honeypot -->
			<div
				class="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden opacity-0"
				aria-hidden="true"
			>
				<label>
					Website
					<input type="text" name="website" tabindex="-1" autocomplete="off" bind:value={website} />
				</label>
			</div>

			<label class="block space-y-2">
				<span class="text-sm font-medium text-text">{t('karne.email.label')}</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					required
					bind:value={email}
					class="flex h-11 w-full rounded-[6px] border border-border bg-surface px-3 text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-ring"
					placeholder={t('karne.email.placeholder')}
				/>
			</label>

			<label class="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-text">
				<input
					type="checkbox"
					class="mt-1 size-4 shrink-0 accent-[var(--brand)]"
					bind:checked={consent}
				/>
				<span>
					{t('karne.email.consentBefore')}
					<a
						href="/kvkk-aydinlatma/"
						class="font-medium text-brand underline-offset-2 hover:underline"
						target="_blank"
						rel="noopener noreferrer"
					>
						{t('karne.email.consentLink')}
					</a>
					{t('karne.email.consentAfter')}
				</span>
			</label>

			{#if errorMsg}
				<p class="text-sm text-danger" role="alert">{errorMsg}</p>
			{/if}

			<button
				type="submit"
				disabled={!canSubmit}
				class="inline-flex h-11 min-w-40 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
			>
				{submitting ? t('karne.email.submitting') : t('karne.email.submit')}
			</button>
		</form>
	{/if}
</section>
