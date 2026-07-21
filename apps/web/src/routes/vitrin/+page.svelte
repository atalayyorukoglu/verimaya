<script lang="ts">
	import SiteLogo from '$lib/components/SiteLogo.svelte';
</script>

<svelte:head>
	<title>Verimaya — Sağlık turizmi operasyon platformu</title>
	<meta
		name="description"
		content="Sağlık turizmi firmaları için hasta takibi, randevu, finans ve entegrasyonlar — tek panelde."
	/>
</svelte:head>

<div class="relative flex min-h-dvh flex-col bg-bg">
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[min(52vh,28rem)] bg-[image:var(--gradient-hero)] opacity-[0.14] dark:opacity-[0.22]"
		aria-hidden="true"
	></div>
	<div
		class="pointer-events-none absolute inset-x-0 top-0 h-[min(52vh,28rem)] bg-linear-to-b from-transparent to-bg"
		aria-hidden="true"
	></div>

	<header class="relative z-10 px-6 py-6 sm:px-10">
		<a href="/vitrin" class="inline-flex rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-ring">
			<SiteLogo description="Sağlık turizmi operasyonları" showText={true} />
		</a>
	</header>

	<main class="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20 pt-8 text-center sm:px-10">
		<p class="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">Verimaya</p>
		<h1 class="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-text sm:text-5xl md:text-6xl">
			Hasta yolculuğunu tek panelde yönetin
		</h1>
		<p class="mt-5 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
			Lead’den randevuya, finanstan WhatsApp işlem aktarımına — sağlık turizmi operasyonlarınız için
			çok kiracılı B2B platform.
		</p>
		<div class="mt-10">
			<a
				href="/giris"
				class="inline-flex h-10 min-w-44 items-center justify-center rounded-[6px] bg-brand px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				Giriş yap
			</a>
		</div>
	</main>

	<footer class="relative z-10 px-6 py-8 text-center text-xs text-text-faint sm:px-10">
		© {new Date().getFullYear()} Verimaya
	</footer>
</div>
