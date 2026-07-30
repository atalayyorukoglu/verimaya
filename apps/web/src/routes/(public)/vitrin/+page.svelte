<script lang="ts">
	// Always visible so prerendered HTML and no-JS users see content (not opacity:0).
	const visible = true;
</script>

<svelte:head>
	<title>Verimaya — Sağlık turizmi operasyon platformu</title>
	<meta
		name="description"
		content="Sağlık turizmi firmaları için hasta takibi, randevu, finans ve entegrasyonlar — tek panelde."
	/>
</svelte:head>

<div class="vitrin relative flex min-h-dvh flex-col overflow-hidden bg-bg text-text">
	<!-- Full-bleed warm atmosphere (TickPort neutrals + terracotta glow) -->
	<div class="vitrin-atmosphere pointer-events-none absolute inset-0" aria-hidden="true">
		<div class="vitrin-wash absolute inset-0"></div>
		<div class="vitrin-glow absolute -top-[20%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2"></div>
		<div class="vitrin-grain absolute inset-0 opacity-[0.035] dark:opacity-[0.06]"></div>
	</div>

	<header
		class="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10"
		class:vitrin-in={visible}
		style="--delay: 0ms"
	>
		<span class="text-sm font-semibold tracking-tight text-text">Verimaya</span>
		<a
			href="/login"
			class="text-sm font-medium text-text-muted transition-colors hover:text-text"
		>
			Giriş
		</a>
	</header>

	<main
		class="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-4 text-center sm:px-10"
	>
		<p
			class="vitrin-brand text-[clamp(2.75rem,8vw,5.5rem)] font-semibold tracking-tight text-text"
			class:vitrin-in={visible}
			style="--delay: 80ms"
		>
			Verimaya
		</p>
		<h1
			class="mt-5 max-w-2xl text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight text-text"
			class:vitrin-in={visible}
			style="--delay: 180ms"
		>
			Hasta yolculuğunu tek panelde yönetin
		</h1>
		<p
			class="mt-4 max-w-lg text-base leading-relaxed text-text-muted sm:text-lg"
			class:vitrin-in={visible}
			style="--delay: 280ms"
		>
			Lead’den randevuya, finanstan WhatsApp işlem aktarımına — sağlık turizmi operasyonları için
			çok kiracılı B2B platform.
		</p>
		<div class:vitrin-in={visible} style="--delay: 380ms" class="mt-10">
			<a
				href="/login"
				class="vitrin-cta inline-flex h-11 min-w-44 items-center justify-center rounded-[6px] bg-brand px-8 text-sm font-medium text-primary-foreground transition-[background-color,transform] hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98]"
			>
				Giriş yap
			</a>
		</div>
	</main>

	<footer
		class="relative z-10 px-6 py-8 text-center text-xs text-text-faint sm:px-10"
		class:vitrin-in={visible}
		style="--delay: 480ms"
	>
		© {new Date().getFullYear()} Verimaya
	</footer>
</div>

<style>
	.vitrin-wash {
		background:
			radial-gradient(ellipse 80% 55% at 50% -10%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 92%, #f0ebe6) 0%, var(--bg) 55%);
	}

	:global(.dark) .vitrin-wash {
		background:
			radial-gradient(ellipse 80% 55% at 50% -10%, color-mix(in srgb, var(--brand) 28%, transparent), transparent 70%),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 88%, #2a2420) 0%, var(--bg) 60%);
	}

	.vitrin-glow {
		background: var(--gradient-hero);
		opacity: 0.16;
		filter: blur(64px);
		animation: vitrin-breathe 10s ease-in-out infinite;
	}

	:global(.dark) .vitrin-glow {
		opacity: 0.22;
	}

	.vitrin-grain {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		mix-blend-mode: multiply;
	}

	:global(.dark) .vitrin-grain {
		mix-blend-mode: soft-light;
	}

	header,
	.vitrin-brand,
	h1,
	main p,
	main > div,
	footer {
		opacity: 0;
		transform: translateY(14px);
		transition:
			opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
		transition-delay: var(--delay, 0ms);
	}

	.vitrin-in {
		opacity: 1;
		transform: translateY(0);
	}

	.vitrin-cta {
		animation: vitrin-cta-lift 2.6s ease-in-out 1.1s infinite;
	}

	@keyframes vitrin-breathe {
		0%,
		100% {
			transform: translateX(-50%) scale(1);
		}
		50% {
			transform: translateX(-50%) scale(1.08);
		}
	}

	@keyframes vitrin-cta-lift {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-3px);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vitrin-glow,
		.vitrin-cta {
			animation: none;
		}

		header,
		.vitrin-brand,
		h1,
		main p,
		main > div,
		footer {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
