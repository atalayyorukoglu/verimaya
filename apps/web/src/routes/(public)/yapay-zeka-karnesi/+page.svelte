<script lang="ts">
	import { PUBLIC_SITE_URL } from '$lib/env';
	import { getKarneStep, startKarne } from '$lib/karne/state.svelte';

	const title = 'Ücretsiz Yapay Zeka Karnesi — Verimaya';
	const description =
		'Kliniğinizin yapay zeka hazırlığını 5 dakikada görün. Üyelik yok — durumunuzu fark edin.';
	const canonical = `${PUBLIC_SITE_URL}/yapay-zeka-karnesi/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;

	const step = $derived(getKarneStep());
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
			<!-- intake UI: Adım 7 -->
		{:else if step === 'questions'}
			<!-- scored questions UI: Adım 8 -->
		{:else}
			<!-- result UI: Adım 10 -->
		{/if}
	</main>
</div>
