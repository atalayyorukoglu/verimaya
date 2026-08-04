<script lang="ts">
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import { PUBLIC_APP_URL, PUBLIC_CRM_URL, PUBLIC_SITE_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';

	// Always visible so prerendered HTML and no-JS users see content (not opacity:0).
	const visible = true;

	const title = 'Verimaya — Sağlık turizmi operasyon platformu';
	const description =
		'Lead WhatsApp’ta, hasta Excel’de, ödeme grupta — ay sonunda kim geldi, kim ödedi bilinmiyor. Maya App, Maya CRM, Kaynaklar ve Araçlar — sağlık turizmi için tek ekosistem.';
	const canonical = `${PUBLIC_SITE_URL}/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;

	const organizationLd = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Verimaya',
		url: PUBLIC_SITE_URL,
		logo: `${PUBLIC_SITE_URL}/icon-512.png`,
		description
	};

	const tools = [
		{
			titleKey: 'hub.tools.campaign.title' as MessageKey,
			descKey: 'hub.tools.campaign.desc' as MessageKey,
			href: '/marketing/templates/'
		},
		{
			titleKey: 'hub.tools.simulator.title' as MessageKey,
			descKey: 'hub.tools.simulator.desc' as MessageKey,
			href: '/marketing/simulator/'
		},
		{
			titleKey: 'hub.tools.prelaunch.title' as MessageKey,
			descKey: 'hub.tools.prelaunch.desc' as MessageKey,
			href: '/marketing/pre-launch/'
		}
	] as const;
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
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Verimaya" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- statik JSON-LD (kullanıcı girdisi yok, XSS riski yok); </script> kaçışı parser'ın string'i erken kapatmasını önlüyor -->
	{@html `<script type="application/ld+json">${JSON.stringify(organizationLd)}<\\/script>`}
</svelte:head>

<div
	class="hub-page relative overflow-hidden bg-bg text-text"
	style="--brand: #f43e01; --brand-hover: #d93601; --brand-subtle: rgba(244, 62, 1, 0.14); --brand-text: #b32e01; --gradient-hero: linear-gradient(135deg, #f43e01, #ff6a33); --primary: var(--brand); --ring: var(--brand)"
>
	<div class="pointer-events-none absolute inset-0" aria-hidden="true">
		<div class="vitrin-wash absolute inset-0"></div>
		<div class="vitrin-glow absolute -top-[20%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2"></div>
		<div class="vitrin-grain absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"></div>
	</div>

	<!-- ── HEADER ── -->
	<header
		class="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10"
		class:vitrin-in={visible}
		style="--delay: 0ms"
	>
		<a href="/" class="text-text">
			<SiteLogo />
		</a>
		<nav class="flex items-center gap-5 text-sm font-medium text-text-muted sm:gap-6">
			<a href="#app" class="hidden transition-colors hover:text-text sm:inline">{t('hub.nav.webApp')}</a>
			<a href="#crm" class="hidden transition-colors hover:text-text sm:inline">{t('hub.nav.crm')}</a>
			<a href="#resources" class="hidden transition-colors hover:text-text sm:inline"
				>{t('hub.nav.resources')}</a
			>
			<a href="#tools" class="hidden transition-colors hover:text-text md:inline">{t('hub.nav.tools')}</a>
		</nav>
	</header>

	<!-- ── HERO: sorun + kapı ── -->
	<section
		class="hero-section relative z-10 flex flex-col items-center justify-center px-6 pt-24 pb-16 text-center sm:px-10 sm:pt-32 sm:pb-20"
	>
		<p
			class="text-sm font-medium text-brand"
			class:vitrin-in={visible}
			style="--delay: 40ms"
		>
			{t('hub.hero.eyebrow')}
		</p>
		<h1
			class="mt-4 max-w-3xl text-[clamp(2rem,6vw,3.75rem)] font-semibold tracking-tight text-text"
			class:vitrin-in={visible}
			style="--delay: 80ms"
		>
			{t('hub.hero.title')}
		</h1>
		<p
			class="mt-5 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg"
			class:vitrin-in={visible}
			style="--delay: 180ms"
		>
			{t('hub.hero.subtitle')}
		</p>
		<div
			class:vitrin-in={visible}
			style="--delay: 280ms"
			class="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center"
		>
			<a
				href="#app"
				class="inline-flex h-11 items-center justify-center rounded-[6px] bg-brand px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
			>
				{t('hub.hero.ctaApp')}
			</a>
			<a
				href="#crm"
				class="inline-flex h-11 items-center justify-center rounded-[6px] border border-border bg-surface px-8 text-sm font-medium text-text transition-colors hover:bg-surface-2"
			>
				{t('hub.hero.ctaCrm')}
			</a>
		</div>
		<p
			class="mt-6 text-xs text-text-faint"
			class:vitrin-in={visible}
			style="--delay: 360ms"
		>
			{t('hub.hero.forkHint')}
		</p>
	</section>

	<!-- ── İKİ KAPI ── -->
	<section class="relative z-10 px-6 py-10 sm:px-10 sm:py-14">
		<div class="mx-auto flex max-w-6xl flex-col gap-6 sm:gap-8">
			<div
				id="app"
				class="hub-stage scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-[var(--stage-border)]"
			>
				<div
					class="grid items-center gap-8 p-8 text-left sm:p-10 lg:grid-cols-2 lg:gap-12 lg:p-12"
				>
					<div>
						<span
							class="inline-flex items-center rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
						>
							{t('hub.stage.app.eyebrow')}
						</span>
						<p class="mt-5 text-sm font-medium text-[var(--stage-fg)] sm:text-base">
							{t('hub.apps.app.problem')}
						</p>
						<h2 class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight">
							{t('hub.apps.app.name')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.app.desc')}
						</p>
						<p class="mt-4 text-xs font-medium text-[var(--stage-faint)]">
							{t('hub.apps.app.outcome')}
						</p>
						<a
							href={PUBLIC_APP_URL}
							class="mt-8 inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
						>
							{t('hub.apps.app.cta')}
						</a>
					</div>
					<div class="hub-mock" aria-hidden="true">
						<div class="hub-mock-chrome">
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
						</div>
						<div class="hub-mock-body">
							<div class="hub-mock-sidebar">
								<div class="hub-mock-nav"></div>
								<div class="hub-mock-nav hub-mock-nav--active"></div>
								<div class="hub-mock-nav"></div>
								<div class="hub-mock-nav"></div>
							</div>
							<div class="hub-mock-main">
								<div class="hub-mock-row"></div>
								<div class="hub-mock-row hub-mock-row--wide"></div>
								<div class="hub-mock-row"></div>
								<div class="hub-mock-row hub-mock-row--short"></div>
								<div class="hub-mock-row hub-mock-row--wide"></div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<div
				id="crm"
				class="hub-stage scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-[var(--stage-border)]"
			>
				<div
					class="flex flex-col items-center gap-8 p-8 text-left sm:p-10 lg:flex-row-reverse lg:gap-12 lg:p-12"
				>
					<div class="w-full lg:w-1/2">
						<span
							class="inline-flex items-center rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
						>
							{t('hub.stage.crm.eyebrow')}
						</span>
						<p class="mt-5 text-sm font-medium text-[var(--stage-fg)] sm:text-base">
							{t('hub.apps.crm.problem')}
						</p>
						<h2 class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight">
							{t('hub.apps.crm.name')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.crm.desc')}
						</p>
						<p class="mt-4 text-xs font-medium text-[var(--stage-faint)]">
							{t('hub.apps.crm.outcome')}
						</p>
						<a
							href={PUBLIC_CRM_URL}
							class="mt-8 inline-flex h-10 items-center justify-center rounded-[6px] border border-white/15 bg-transparent px-6 text-sm font-medium text-[var(--stage-fg)] transition-colors hover:border-white/30 hover:bg-white/5"
						>
							{t('hub.apps.crm.cta')}
						</a>
					</div>
					<div class="hub-mock w-full lg:w-1/2" aria-hidden="true">
						<div class="hub-mock-chrome">
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
						</div>
						<div class="hub-mock-body">
							<div class="hub-mock-sidebar">
								<div class="hub-mock-nav hub-mock-nav--active"></div>
								<div class="hub-mock-nav"></div>
								<div class="hub-mock-nav"></div>
							</div>
							<div class="hub-mock-main">
								<div class="hub-mock-pipeline">
									<div class="hub-mock-col"></div>
									<div class="hub-mock-col"></div>
									<div class="hub-mock-col"></div>
								</div>
								<div class="hub-mock-row hub-mock-row--wide"></div>
								<div class="hub-mock-row"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ── KAYNAKLAR ── -->
	<section
		id="resources"
		class="relative z-10 scroll-mt-24 border-t border-border/40 px-6 py-20 sm:px-10 sm:py-24"
	>
		<div class="mx-auto max-w-3xl text-center">
			<p class="text-sm font-medium text-brand">{t('hub.nav.resources')}</p>
			<p class="mt-4 text-base font-medium text-text sm:text-lg">{t('hub.resources.problem')}</p>
			<h2 class="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-tight text-text">
				{t('hub.resources.title')}
			</h2>
			<p class="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">
				{t('hub.resources.desc')}
			</p>
			<p class="mt-3 text-sm text-text-faint">{t('hub.resources.outcome')}</p>
			<div class="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row">
				<a
					href="/features/"
					class="inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
				>
					{t('hub.resources.ctaPrimary')}
				</a>
				<a
					href="/yapay-zeka-karnesi/"
					class="inline-flex h-10 items-center justify-center rounded-[6px] border border-border bg-surface px-6 text-sm font-medium text-text transition-colors hover:bg-surface-2"
				>
					{t('hub.resources.ctaSecondary')}
				</a>
			</div>
		</div>
	</section>

	<!-- ── ARAÇLAR ── -->
	<section
		id="tools"
		class="relative z-10 scroll-mt-24 border-t border-border/40 px-6 py-20 sm:px-10 sm:py-24"
	>
		<div class="mx-auto max-w-6xl">
			<div class="mx-auto mb-12 max-w-3xl text-center">
				<p class="text-sm font-medium text-brand">{t('hub.nav.tools')}</p>
				<p class="mt-4 text-base font-medium text-text sm:text-lg">{t('hub.tools.problem')}</p>
				<h2 class="mt-4 text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-tight text-text">
					{t('hub.tools.title')}
				</h2>
				<p class="mt-4 text-base leading-relaxed text-text-muted sm:text-lg">
					{t('hub.tools.desc')}
				</p>
			</div>

			<div class="grid gap-6 sm:grid-cols-3">
				{#each tools as { titleKey, descKey, href } (titleKey)}
					<a
						{href}
						class="section-card rounded-xl border border-border bg-surface p-6 text-left transition-colors hover:border-brand/40 hover:bg-surface-2"
					>
						<h3 class="text-sm font-semibold text-text">{t(titleKey)}</h3>
						<p class="mt-2 text-xs leading-relaxed text-text-muted">{t(descKey)}</p>
					</a>
				{/each}
			</div>
		</div>
	</section>

	<!-- ── CTA BAND ── -->
	<section class="relative z-10 px-6 py-16 sm:px-10 sm:py-20">
		<div class="mx-auto max-w-6xl">
			<div
				class="flex flex-col items-center rounded-[1.5rem] bg-brand px-8 py-12 text-center text-primary-foreground sm:px-12 sm:py-16"
			>
				<h2 class="text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold tracking-tight">
					{t('hub.ctaBand.title')}
				</h2>
				<p class="mt-3 max-w-lg text-sm text-primary-foreground/85 sm:text-base">
					{t('hub.ctaBand.subtitle')}
				</p>
				<div class="mt-8 flex flex-col gap-3 sm:flex-row">
					<a
						href={PUBLIC_APP_URL}
						class="inline-flex h-11 items-center justify-center rounded-[6px] bg-white px-8 text-sm font-medium text-brand transition-colors hover:bg-white/90"
					>
						{t('hub.ctaBand.cta')}
					</a>
					<a
						href={PUBLIC_CRM_URL}
						class="inline-flex h-11 items-center justify-center rounded-[6px] border border-white/40 bg-transparent px-8 text-sm font-medium text-primary-foreground transition-colors hover:bg-white/10"
					>
						{t('hub.ctaBand.ctaCrm')}
					</a>
				</div>
			</div>
		</div>
	</section>

	<!-- ── FOOTER ── -->
	<footer
		class="relative z-10 border-t border-border/40 px-6 py-12 sm:px-10"
		class:vitrin-in={visible}
		style="--delay: 0ms"
	>
		<div class="mx-auto max-w-6xl">
			<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
				<div>
					<a href="/" class="inline-block text-text">
						<SiteLogo />
					</a>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-faint">{t('hub.footer.links')}</p>
					<ul class="mt-4 space-y-2">
						<li>
							<a href={PUBLIC_APP_URL} class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.webApp')}</a
							>
						</li>
						<li>
							<a href={PUBLIC_CRM_URL} class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.crm')}</a
							>
						</li>
						<li>
							<a href="#resources" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.resources')}</a
							>
						</li>
						<li>
							<a href="#tools" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.tools')}</a
							>
						</li>
					</ul>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-faint"
						>{t('hub.footer.resources')}</p
					>
					<ul class="mt-4 space-y-2">
						<li>
							<a href="/features/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('nav.features')}</a
							>
						</li>
						<li>
							<a href="/changelog/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('nav.changelog')}</a
							>
						</li>
						<li>
							<a
								href="/yapay-zeka-karnesi/"
								class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.karne.title')}</a
							>
						</li>
					</ul>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-faint">{t('hub.footer.legal')}</p>
					<ul class="mt-4 space-y-2">
						<li>
							<a
								href="/kvkk-aydinlatma/"
								class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.footer.kvkk')}</a
							>
						</li>
					</ul>
				</div>
			</div>
			<div class="mt-10 border-t border-border/40 pt-6 text-center text-xs text-text-faint">
				© {new Date().getFullYear()} Verimaya
			</div>
		</div>
	</footer>
</div>

<style>
	.vitrin-wash {
		background:
			radial-gradient(
				ellipse 80% 55% at 50% -10%,
				color-mix(in srgb, var(--brand) 14%, transparent),
				transparent 70%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 94%, #f0ebe6) 0%, var(--bg) 55%);
	}

	:global(.dark) .vitrin-wash {
		background:
			radial-gradient(
				ellipse 80% 55% at 50% -10%,
				color-mix(in srgb, var(--brand) 18%, transparent),
				transparent 70%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 90%, #2a2420) 0%, var(--bg) 60%);
	}

	.vitrin-glow {
		background: var(--gradient-hero);
		opacity: 0.1;
		filter: blur(64px);
		animation: vitrin-breathe 10s ease-in-out infinite;
	}

	:global(.dark) .vitrin-glow {
		opacity: 0.14;
	}

	.vitrin-grain {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		mix-blend-mode: multiply;
	}

	:global(.dark) .vitrin-grain {
		mix-blend-mode: soft-light;
	}

	.hub-stage {
		--stage-bg: #1a1a19;
		--stage-fg: #ededec;
		--stage-muted: #8a8a87;
		--stage-faint: #6e6e6b;
		--stage-border: #333332;
		--stage-surface: #242423;
		background: var(--stage-bg);
		color: var(--stage-fg);
	}

	.hub-mock {
		overflow: hidden;
		border-radius: 0.75rem;
		border: 1px solid var(--stage-border);
		background: var(--stage-surface);
	}

	.hub-mock-chrome {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border-bottom: 1px solid var(--stage-border);
		padding: 0.625rem 0.875rem;
	}

	.hub-mock-dot {
		height: 0.5rem;
		width: 0.5rem;
		border-radius: 9999px;
		background: var(--stage-border);
	}

	.hub-mock-body {
		display: flex;
		min-height: 11rem;
	}

	.hub-mock-sidebar {
		display: flex;
		width: 28%;
		flex-direction: column;
		gap: 0.5rem;
		border-right: 1px solid var(--stage-border);
		padding: 0.875rem 0.75rem;
	}

	.hub-mock-nav {
		height: 0.5rem;
		border-radius: 0.25rem;
		background: var(--stage-border);
	}

	.hub-mock-nav--active {
		background: color-mix(in srgb, var(--brand) 55%, var(--stage-border));
		width: 85%;
	}

	.hub-mock-main {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0.875rem 1rem;
	}

	.hub-mock-row {
		height: 0.5rem;
		width: 70%;
		border-radius: 0.25rem;
		background: var(--stage-border);
	}

	.hub-mock-row--wide {
		width: 92%;
	}

	.hub-mock-row--short {
		width: 48%;
	}

	.hub-mock-pipeline {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.hub-mock-col {
		height: 4.5rem;
		border-radius: 0.375rem;
		border: 1px solid var(--stage-border);
		background: color-mix(in srgb, var(--stage-bg) 70%, var(--stage-surface));
	}

	header,
	.hero-section > p,
	.hero-section > h1,
	.hero-section > div,
	footer {
		opacity: 0;
		transform: translateY(14px);
		transition:
			opacity 0.7s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.7s cubic-bezier(0.22, 1, 0.36, 1);
		transition-delay: var(--delay, 0ms);
	}

	header.vitrin-in,
	.hero-section > p.vitrin-in,
	.hero-section > h1.vitrin-in,
	.hero-section > div.vitrin-in,
	footer.vitrin-in {
		opacity: 1;
		transform: translateY(0);
	}

	.section-card {
		opacity: 0;
		transform: translateY(12px);
		animation: card-enter 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	#tools .section-card:nth-child(1) {
		animation-delay: 0.05s;
	}
	#tools .section-card:nth-child(2) {
		animation-delay: 0.1s;
	}
	#tools .section-card:nth-child(3) {
		animation-delay: 0.15s;
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

	@keyframes card-enter {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vitrin-glow {
			animation: none;
		}

		header,
		.hero-section > p,
		.hero-section > h1,
		.hero-section > div,
		footer,
		.section-card {
			opacity: 1;
			transform: none;
			transition: none;
			animation: none;
		}
	}
</style>
