<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { PUBLIC_SITE_URL } from '$lib/env';
	import {
		intakeQuestions,
		karneQuestions,
		type IntakeBandId,
		type IntakeEuId
	} from '$lib/karne/questions';
	import {
		canAdvanceIntake,
		canAdvanceQuestion,
		currentIntakeAnswer,
		currentQuestionAnswer,
		getIntakeBand,
		getIntakeEu,
		getIntakeIndex,
		getKarneAnswers,
		getKarneStep,
		getQuestionIndex,
		hydrateKarneFromSession,
		intakeBack,
		intakeNext,
		questionBack,
		questionNext,
		setIntakeBand,
		setIntakeEu,
		setQuestionAnswer,
		startKarne
	} from '$lib/karne/state.svelte';
	import { scoreKarne } from '$lib/karne/score';
	import {
		clearKarneTelemetrySession,
		startSession,
		trackAnswered,
		trackComplete,
		trackViewed
	} from '$lib/karne/telemetry';
	import KarneResult from '$lib/components/KarneResult.svelte';

	const title = 'Ücretsiz Yapay Zeka Karnesi — Verimaya';
	const description =
		'Kliniğinizin yapay zeka hazırlığını 5 dakikada görün. Üyelik yok — durumunuzu fark edin.';
	const canonical = `${PUBLIC_SITE_URL}/yapay-zeka-karnesi/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;

	const step = $derived(getKarneStep());
	const intakeIdx = $derived(getIntakeIndex());
	const intakeQ = $derived(intakeQuestions[intakeIdx]);
	const intakeSelected = $derived(currentIntakeAnswer());
	const canIntakeNext = $derived(canAdvanceIntake());

	const qIdx = $derived(getQuestionIndex());
	const question = $derived(karneQuestions[qIdx]);
	const questionSelected = $derived(currentQuestionAnswer());
	const canQuestionNext = $derived(canAdvanceQuestion());

	const result = $derived(
		scoreKarne(getKarneAnswers(), {
			band: getIntakeBand(),
			eu: getIntakeEu()
		})
	);
	const intakeBand = $derived(getIntakeBand());
	const intakeEu = $derived(getIntakeEu());

	onMount(() => {
		hydrateKarneFromSession();
		ensureTelemetrySession();
	});

	/** Viewed events for scored questions (idempotent on API). */
	$effect(() => {
		if (!browser) return;
		if (step !== 'questions') return;
		const id = question.id;
		trackViewed(id);
	});

	function ensureTelemetrySession(): void {
		const band = getIntakeBand();
		const eu = getIntakeEu();
		const s = getKarneStep();
		if (!band || !eu) return;
		if (s !== 'questions' && s !== 'result') return;
		startSession({ band, eu_exposure: eu });
	}

	function onStart(): void {
		clearKarneTelemetrySession();
		startKarne();
	}

	function onSelectIntake(choiceId: string) {
		if (intakeQ.id === 'band') {
			setIntakeBand(choiceId as IntakeBandId);
		} else {
			setIntakeEu(choiceId as IntakeEuId);
		}
	}

	function onIntakeNext(): void {
		intakeNext();
		if (getKarneStep() === 'questions') {
			ensureTelemetrySession();
		}
	}

	function onQuestionNext(): void {
		const id = question.id;
		const choice = questionSelected;
		if (choice) {
			trackAnswered(id, choice);
		}
		questionNext();
		if (getKarneStep() === 'result') {
			trackComplete(result.zeroCount);
		}
	}

	const choiceClass =
		'flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:locale" content="tr_TR" />
	<meta property="og:site_name" content="Verimaya" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

<div class="flex min-h-dvh flex-col bg-bg text-text">
	<header class="flex items-center justify-between px-6 py-6 sm:px-10">
		<a href="/vitrin/" class="flex items-center gap-2 text-text">
			<BrandMark class="h-6 w-6" title="" />
			<span class="text-sm font-semibold tracking-tight">Verimaya</span>
		</a>
		<a
			href="/login"
			class="text-sm font-medium text-text-muted transition-colors hover:text-text"
		>
			Giriş
		</a>
	</header>

	<main class="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 pb-16 sm:px-10">
		{#if step === 'intro'}
			<p class="text-sm font-medium text-brand">Ücretsiz · 5 dakika</p>
			<h1 class="mt-3 text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight text-text">
				Yapay zeka karnesi
			</h1>
			<p class="mt-4 text-base leading-relaxed text-text-muted">
				Kliniğinizin yapay zeka hazırlığını ölçmek için değil — durumunuzu fark etmek için. Üyelik
				yok; 10 kısa soru, ardından net bir özet.
			</p>
			<button
				type="button"
				class="mt-10 inline-flex h-11 min-w-44 items-center justify-center rounded-[6px] bg-brand px-8 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
				onclick={onStart}
			>
				Başla
			</button>
		{:else if step === 'intake'}
			<p class="text-sm text-text-muted">
				{intakeIdx + 1} / {intakeQuestions.length}
			</p>
			<h1 class="mt-3 text-[clamp(1.35rem,3.5vw,1.75rem)] font-semibold tracking-tight text-text">
				{intakeQ.title}
			</h1>

			<fieldset class="mt-8 space-y-3 border-0 p-0" aria-label={intakeQ.title}>
				<legend class="sr-only">{intakeQ.title}</legend>
				{#each intakeQ.choices as choice (choice.id)}
					<label
						class="{choiceClass} {intakeSelected === choice.id
							? 'border-brand ring-1 ring-brand'
							: ''}"
					>
						<input
							type="radio"
							class="size-4 shrink-0 accent-[var(--brand)]"
							name="karne-intake-{intakeQ.id}"
							value={choice.id}
							checked={intakeSelected === choice.id}
							onchange={() => onSelectIntake(choice.id)}
						/>
						<span class="text-sm font-medium text-text">{choice.label}</span>
					</label>
				{/each}
			</fieldset>

			<div class="mt-10 flex items-center justify-between gap-3">
				<button
					type="button"
					class="inline-flex h-11 items-center justify-center rounded-[6px] px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					onclick={intakeBack}
				>
					Geri
				</button>
				<button
					type="button"
					class="inline-flex h-11 min-w-28 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
					disabled={!canIntakeNext}
					onclick={onIntakeNext}
				>
					İleri
				</button>
			</div>
		{:else if step === 'questions'}
			<p class="text-sm text-text-muted" aria-live="polite">
				{qIdx + 1} / {karneQuestions.length}
			</p>
			<h1 class="mt-3 text-[clamp(1.35rem,3.5vw,1.75rem)] font-semibold tracking-tight text-text">
				{question.title}
			</h1>
			{#if question.hint}
				<p class="mt-3 text-sm leading-relaxed text-text-muted">
					Örneğin: {question.hint}
				</p>
			{/if}

			<fieldset class="mt-8 space-y-3 border-0 p-0" aria-label={question.title}>
				<legend class="sr-only">{question.title}</legend>
				{#each question.choices as choice (choice.id)}
					<label
						class="{choiceClass} {questionSelected === choice.id
							? 'border-brand ring-1 ring-brand'
							: ''}"
					>
						<input
							type="radio"
							class="size-4 shrink-0 accent-[var(--brand)]"
							name="karne-q-{question.id}"
							value={choice.id}
							checked={questionSelected === choice.id}
							onchange={() => setQuestionAnswer(choice.id)}
						/>
						<span class="text-sm font-medium text-text">{choice.label}</span>
					</label>
				{/each}
			</fieldset>

			<div class="mt-10 flex items-center justify-between gap-3">
				<button
					type="button"
					class="inline-flex h-11 items-center justify-center rounded-[6px] px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					onclick={questionBack}
				>
					Geri
				</button>
				<button
					type="button"
					class="inline-flex h-11 min-w-28 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
					disabled={!canQuestionNext}
					onclick={onQuestionNext}
				>
					{qIdx >= karneQuestions.length - 1 ? 'Bitir' : 'İleri'}
				</button>
			</div>
		{:else if intakeBand && intakeEu}
			<KarneResult result={result} band={intakeBand} eu={intakeEu} />
		{/if}
	</main>
</div>
