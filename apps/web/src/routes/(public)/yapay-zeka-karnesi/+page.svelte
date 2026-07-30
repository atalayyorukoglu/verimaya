<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_SITE_URL } from '$lib/env';
	import {
		intakeQuestions,
		type IntakeBandId,
		type IntakeEuId
	} from '$lib/karne/questions';
	import {
		canAdvanceIntake,
		currentIntakeAnswer,
		getIntakeIndex,
		getKarneStep,
		hydrateKarneFromSession,
		intakeBack,
		intakeNext,
		setIntakeBand,
		setIntakeEu,
		startKarne
	} from '$lib/karne/state.svelte';

	const title = 'Ücretsiz Yapay Zeka Karnesi — Verimaya';
	const description =
		'Kliniğinizin yapay zeka hazırlığını 5 dakikada görün. Üyelik yok — durumunuzu fark edin.';
	const canonical = `${PUBLIC_SITE_URL}/yapay-zeka-karnesi/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;

	const step = $derived(getKarneStep());
	const intakeIdx = $derived(getIntakeIndex());
	const intakeQ = $derived(intakeQuestions[intakeIdx]);
	const selected = $derived(currentIntakeAnswer());
	const canNext = $derived(canAdvanceIntake());

	onMount(() => {
		hydrateKarneFromSession();
	});

	function onSelectIntake(choiceId: string) {
		if (intakeQ.id === 'band') {
			setIntakeBand(choiceId as IntakeBandId);
		} else {
			setIntakeEu(choiceId as IntakeEuId);
		}
	}
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
		<a href="/vitrin" class="text-sm font-semibold tracking-tight text-text">Verimaya</a>
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
				onclick={startKarne}
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

			<fieldset class="mt-8 space-y-3 border-0 p-0">
				<legend class="sr-only">{intakeQ.title}</legend>
				{#each intakeQ.choices as choice (choice.id)}
					<label
						class="flex cursor-pointer items-center gap-3 rounded-[8px] border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring {selected ===
						choice.id
							? 'border-brand ring-1 ring-brand'
							: ''}"
					>
						<input
							type="radio"
							class="size-4 accent-[var(--brand)]"
							name="karne-intake-{intakeQ.id}"
							value={choice.id}
							checked={selected === choice.id}
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
					disabled={!canNext}
					onclick={intakeNext}
				>
					İleri
				</button>
			</div>
		{:else if step === 'questions'}
			<!-- scored questions UI: Adım 8 -->
		{:else}
			<!-- result UI: Adım 10 -->
		{/if}
	</main>
</div>
