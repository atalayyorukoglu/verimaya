<script lang="ts">
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleToggle from '$lib/components/LocaleToggle.svelte';
	import { PUBLIC_APP_URL, PUBLIC_CRM_URL, PUBLIC_SITE_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	type FeatureItem = {
		title: string;
		description: string;
		href?: string;
	};

	type Cta = { label: string; href: string; external?: boolean };

	let {
		pageTitle,
		pageDescription,
		canonicalPath,
		eyebrow,
		heading,
		problem,
		outcome,
		features,
		primaryCta,
		secondaryCta,
		body
	}: {
		pageTitle: string;
		pageDescription: string;
		canonicalPath: string;
		eyebrow: string;
		heading: string;
		problem: string;
		outcome: string;
		features: FeatureItem[];
		primaryCta: Cta;
		secondaryCta?: Cta;
		body?: string;
	} = $props();

	let menuOpen = $state(false);
	let loginOpen = $state(false);

	const canonical = $derived(
		`${PUBLIC_SITE_URL}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`
	);
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;
	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	const navItems = [
		{ href: '/app/', labelKey: 'hub.nav.webApp' as MessageKey },
		{ href: '/crm/', labelKey: 'hub.nav.crm' as MessageKey },
		{ href: '/tools/', labelKey: 'hub.nav.tools' as MessageKey },
		{ href: '/resources/', labelKey: 'hub.nav.resources' as MessageKey }
	] as const;

	const hasLinkedFeatures = $derived(features.some((f) => Boolean(f.href)));

	function closeMenu() {
		menuOpen = false;
		loginOpen = false;
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
		if (!menuOpen) loginOpen = false;
	}

	function toggleLogin(e: MouseEvent) {
		e.stopPropagation();
		loginOpen = !loginOpen;
	}

	function onWindowClick() {
		if (loginOpen) loginOpen = false;
	}
</script>

<svelte:window onclick={onWindowClick} />

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:locale" content="tr_TR" />
	<meta property="og:site_name" content="Veri Maya" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Veri Maya" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={ogImage} />
</svelte:head>

<div
	class="pillar-page relative overflow-hidden bg-bg text-text"
	style="--brand: #f43e01; --brand-hover: #d93601; --brand-subtle: rgba(244, 62, 1, 0.14); --brand-text: #b32e01; --gradient-hero: linear-gradient(135deg, #f43e01, #ff6a33); --primary: var(--brand); --ring: var(--brand)"
>
	<div class="pointer-events-none absolute inset-0" aria-hidden="true">
		<div class="vitrin-wash absolute inset-0"></div>
		<div class="vitrin-glow absolute -top-[20%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2"></div>
		<div class="vitrin-grain absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"></div>
	</div>

	<header class="relative z-10 px-6 py-6 sm:px-10">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between">
			<a href="/" class="text-text" onclick={closeMenu}>
				<SiteLogo />
			</a>
			<div class="flex items-center gap-2 sm:gap-5">
				<nav class="hidden items-center gap-5 text-sm font-medium text-text-muted sm:flex sm:gap-6">
					{#each navItems as item (item.href)}
						<a href={item.href} class="transition-colors hover:text-text">{t(item.labelKey)}</a>
					{/each}
				</nav>
				<div class="relative hidden sm:block">
					<button
						type="button"
						class="inline-flex h-9 items-center gap-1 rounded-[6px] bg-brand px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
						aria-expanded={loginOpen}
						aria-haspopup="menu"
						onclick={toggleLogin}
					>
						{t('hub.login')}
						<ChevronDown class="size-4 opacity-90" aria-hidden="true" />
					</button>
					<div
						class="absolute right-0 z-40 mt-2 w-52 rounded-[8px] border border-border bg-surface py-1 shadow-lg"
						class:hidden={!loginOpen}
						role="menu"
						tabindex="-1"
					>
						<a
							href={appLoginUrl}
							class="block px-3 py-2 text-sm text-text hover:bg-surface-2"
							role="menuitem"
							onclick={closeMenu}
						>
							{t('hub.login.app')}
						</a>
						<a
							href={PUBLIC_CRM_URL}
							class="block px-3 py-2 text-sm text-text hover:bg-surface-2"
							role="menuitem"
							onclick={closeMenu}
						>
							{t('hub.login.crm')}
						</a>
					</div>
				</div>
				<LocaleToggle />
				<ThemeToggle />
				<button
					type="button"
					class="inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:hidden"
					aria-expanded={menuOpen}
					aria-controls="pillar-mobile-nav"
					aria-label={menuOpen ? t('hub.menu.close') : t('hub.menu.open')}
					onclick={toggleMenu}
				>
					<span class:hidden={menuOpen}>
						<Menu class="size-5" />
					</span>
					<span class:hidden={!menuOpen}>
						<X class="size-5" />
					</span>
				</button>
			</div>
		</div>
		<nav
			id="pillar-mobile-nav"
			class="mx-auto mt-4 w-full max-w-6xl flex-col gap-1 border-t border-border/40 pt-4 sm:hidden {menuOpen
				? 'flex'
				: 'hidden'}"
		>
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="rounded-md px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					onclick={closeMenu}
				>
					{t(item.labelKey)}
				</a>
			{/each}
			<div class="mt-2 border-t border-border/40 pt-3">
				<button
					type="button"
					class="flex w-full items-center justify-between rounded-[6px] bg-brand px-3 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
					aria-expanded={loginOpen}
					onclick={toggleLogin}
				>
					{t('hub.login')}
					<ChevronDown
						class="size-4 opacity-90 transition-transform {loginOpen ? 'rotate-180' : ''}"
						aria-hidden="true"
					/>
				</button>
				<div class="mt-1 flex-col gap-0.5 pl-1 {loginOpen ? 'flex' : 'hidden'}">
					<a
						href={appLoginUrl}
						class="rounded-md px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
						onclick={closeMenu}
					>
						{t('hub.login.app')}
					</a>
					<a
						href={PUBLIC_CRM_URL}
						class="rounded-md px-3 py-2.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
						onclick={closeMenu}
					>
						{t('hub.login.crm')}
					</a>
				</div>
			</div>
		</nav>
	</header>

	<main class="relative z-10 px-6 pb-20 pt-16 sm:px-10 sm:pt-24">
		<div class="mx-auto max-w-3xl text-center">
			<p class="flex justify-center">
				<span
					class="inline-flex items-center rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
				>
					{eyebrow}
				</span>
			</p>
			<h1
				class="mt-4 text-[clamp(1.75rem,4.5vw,3rem)] font-semibold leading-[1.15] tracking-tight text-text"
			>
				{heading}
			</h1>
			<p class="mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed text-text sm:text-lg">
				{problem}
			</p>
			{#if body}
				<p class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
					{body}
				</p>
			{/if}
			<p class="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
				{outcome}
			</p>
		</div>

		{#if features.length > 0}
			<div class="mx-auto mt-14 {hasLinkedFeatures ? 'max-w-6xl' : 'max-w-3xl'}">
				{#if hasLinkedFeatures}
					<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each features as feature, i (feature.href ?? `${feature.title}-${i}`)}
							<li>
								{#if feature.href}
									<a
										href={feature.href}
										class="block h-full rounded-xl border border-border bg-surface p-6 text-left transition-colors hover:border-brand/40 hover:bg-surface-2"
									>
										<h2 class="text-sm font-semibold text-text">{feature.title}</h2>
										<p class="mt-2 text-xs leading-relaxed text-text-muted">{feature.description}</p>
									</a>
								{:else}
									<div class="h-full rounded-xl border border-border bg-surface p-6 text-left">
										<h2 class="text-sm font-semibold text-text">{feature.title}</h2>
										<p class="mt-2 text-xs leading-relaxed text-text-muted">{feature.description}</p>
									</div>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<ul class="space-y-6 text-left">
						{#each features as feature, i (`${feature.title}-${i}`)}
							<li class="border-b border-border/40 pb-6 last:border-b-0 last:pb-0">
								<h2 class="text-base font-semibold text-text">{feature.title}</h2>
								<p class="mt-2 text-sm leading-relaxed text-text-muted">{feature.description}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<div class="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-center gap-3 sm:flex-row">
			<a
				href={primaryCta.href}
				class="inline-flex h-10 items-center justify-center rounded-[6px] bg-brand px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
				target={primaryCta.external ? '_blank' : undefined}
				rel={primaryCta.external ? 'noopener noreferrer' : undefined}
			>
				{primaryCta.label}
			</a>
			{#if secondaryCta}
				<a
					href={secondaryCta.href}
					class="inline-flex h-10 items-center justify-center rounded-[6px] border border-border bg-surface px-6 text-sm font-medium text-text transition-colors hover:bg-surface-2"
					target={secondaryCta.external ? '_blank' : undefined}
					rel={secondaryCta.external ? 'noopener noreferrer' : undefined}
				>
					{secondaryCta.label}
				</a>
			{/if}
		</div>
	</main>

	<footer class="relative z-10 border-t border-border/40 px-6 py-12 sm:px-10">
		<div class="mx-auto max-w-6xl">
			<div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
				<div>
					<a href="/" class="inline-block text-text">
						<SiteLogo />
					</a>
					<p class="mt-4">
						<a href="/" class="text-xs text-text-muted transition-colors hover:text-text">
							Veri Maya
						</a>
					</p>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-faint">
						{t('hub.footer.links')}
					</p>
					<ul class="mt-4 space-y-2">
						{#each navItems as item (item.href)}
							<li>
								<a
									href={item.href}
									class="text-xs text-text-muted transition-colors hover:text-text"
								>
									{t(item.labelKey)}
								</a>
							</li>
						{/each}
					</ul>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-text-faint">
						{t('hub.footer.legal')}
					</p>
					<ul class="mt-4 space-y-2">
						<li>
							<a
								href="/kvkk-aydinlatma/"
								class="text-xs text-text-muted transition-colors hover:text-text"
							>
								{t('hub.footer.kvkk')}
							</a>
						</li>
					</ul>
				</div>
			</div>
			<div class="mt-10 border-t border-border/40 pt-6 text-center text-xs text-text-faint">
				© {new Date().getFullYear()} Veri Maya
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

	@keyframes vitrin-breathe {
		0%,
		100% {
			transform: translateX(-50%) scale(1);
		}
		50% {
			transform: translateX(-50%) scale(1.08);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.vitrin-glow {
			animation: none;
		}
	}
</style>
