<script lang="ts">
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import LocaleToggle from '$lib/components/LocaleToggle.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import { PUBLIC_APP_URL, PUBLIC_CRM_URL, PUBLIC_SITE_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import type { MessageKey } from '$lib/i18n/messages';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import Lock from '@lucide/svelte/icons/lock';

	let menuOpen = $state(false);
	let loginOpen = $state(false);

	const heroTitleParts = $derived.by(() => {
		const full = t('hub.hero.title');
		const ellipsisIdx = full.indexOf('...');
		if (ellipsisIdx === -1) {
			return { primary: full, muted: '' };
		}
		const cut = ellipsisIdx + 3;
		return { primary: full.slice(0, cut), muted: full.slice(cut) };
	});

	const title = 'Veri Maya: Sağlık turizmi operasyon platformu';
	const description =
		'Lead WhatsApp’ta, hasta Excel’de, ödeme grupta. Ay sonunda kim geldi, kim ödedi bilinmiyor. Maya App, Maya CRM, Araçlar ve Kaynaklar ile sağlık turizmi için tek ekosistem.';
	const canonical = `${PUBLIC_SITE_URL}/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;
	const appLoginUrl = `${PUBLIC_APP_URL}/login`;
	const whatsappContactUrl = 'https://wa.me/905326566007';

	const organizationLd = {
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Veri Maya',
		url: PUBLIC_SITE_URL,
		logo: `${PUBLIC_SITE_URL}/icon-512.png`,
		description
	};

	const navItems = [
		{ href: '/app/', labelKey: 'hub.nav.webApp' as MessageKey },
		{ href: '/crm/', labelKey: 'hub.nav.crm' as MessageKey },
		{ href: '/tools/', labelKey: 'hub.nav.tools' as MessageKey },
		{ href: '/resources/', labelKey: 'hub.nav.resources' as MessageKey }
	] as const;

	const tools = [
		{
			titleKey: 'hub.tools.campaign.title' as MessageKey,
			descKey: 'hub.tools.campaign.desc' as MessageKey,
			href: '/tools/templates/'
		},
		{
			titleKey: 'hub.tools.simulator.title' as MessageKey,
			descKey: 'hub.tools.simulator.desc' as MessageKey,
			href: '/tools/simulator/'
		},
		{
			titleKey: 'hub.tools.prelaunch.title' as MessageKey,
			descKey: 'hub.tools.prelaunch.desc' as MessageKey,
			href: '/tools/pre-launch/'
		},
		{
			titleKey: 'hub.tools.scorecard.title' as MessageKey,
			descKey: 'hub.tools.scorecard.desc' as MessageKey,
			href: '/yapay-zeka-karnesi/'
		}
	] as const;

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
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />

	<meta property="og:type" content="website" />
	<meta property="og:locale" content="tr_TR" />
	<meta property="og:site_name" content="Veri Maya" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Veri Maya" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- statik JSON-LD; `<` u+003c'ye escape edilir ki organizationLd'ye ileride dinamik veri eklenirse "</script>" ile tag'den kaçış mümkün olmasın. </script> kaçışı ayrıca parser'ın string'i erken kapatmasını önlüyor -->
	{@html `<script type="application/ld+json">${JSON.stringify(organizationLd).replace(/</g, '\\u003c')}<\/script>`}
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
				<LocaleToggle />
				<ThemeToggle />
				<div class="relative">
					<button
						type="button"
						data-hub-login-toggle
						class="inline-flex h-9 items-center gap-1 rounded-[6px] bg-brand px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover sm:px-3.5"
						aria-expanded={loginOpen}
						aria-haspopup="menu"
						onclick={toggleLogin}
					>
						{t('hub.login')}
						<ChevronDown class="size-4 opacity-90" aria-hidden="true" />
					</button>
					<div
						data-hub-login-panel
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
				<button
					type="button"
					data-hub-menu-toggle
					data-label-open={t('hub.menu.open')}
					data-label-close={t('hub.menu.close')}
					class="inline-flex size-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:hidden"
					aria-expanded={menuOpen}
					aria-controls="hub-mobile-nav"
					aria-label={menuOpen ? t('hub.menu.close') : t('hub.menu.open')}
					onclick={toggleMenu}
				>
					<span data-hub-menu-icon-open class:hidden={menuOpen}>
						<Menu class="size-5" />
					</span>
					<span data-hub-menu-icon-close class:hidden={!menuOpen}>
						<X class="size-5" />
					</span>
				</button>
			</div>
		</div>
		<nav
			id="hub-mobile-nav"
			data-hub-mobile-nav
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
		</nav>
	</header>

	<!-- ── HERO: sorun + kapı ── -->
	<section class="hero-section relative z-10 py-16 sm:py-20 lg:py-28">
		<div class="mx-auto max-w-6xl px-6 sm:px-10">
			<div class="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
				<div
					class="flex flex-col items-center pr-0 text-center sm:pr-0 lg:items-start lg:pr-12 lg:text-left xl:pr-16"
				>
					<div>
						<span
							class="inline-flex items-center rounded-full bg-brand/15 px-2.5 py-0.5 text-[11px] font-medium text-brand"
						>
							{t('hub.hero.eyebrow')}
						</span>
					</div>
					<h1
						class="mt-4 max-w-[24ch] text-2xl font-semibold leading-[1.35] tracking-tight text-text sm:max-w-[26ch] sm:text-[1.65rem] lg:text-[1.85rem] lg:leading-[1.32]"
					>
						<span>{heroTitleParts.primary}</span><span class="text-text-muted"
							>{heroTitleParts.muted}</span
						>
					</h1>
					<div class="mt-6 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
						<a
							href={whatsappContactUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="inline-flex h-9 items-center justify-center rounded-full bg-brand px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
						>
							{t('hub.hero.ctaContact')}
						</a>
					</div>
				</div>

				<div class="hero-visual relative isolate" aria-hidden="true">
					<div class="hero-iso-grid pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-40"></div>

					<!-- Floating chaos sheets -->
					<div class="relative mx-auto max-w-md lg:max-w-none">
						<div class="flex flex-col items-center gap-2.5 pl-2 pr-6 sm:pr-10">
							<div
								class="hero-float-card flex w-[min(100%,14.5rem)] items-center justify-between rounded-lg border border-border bg-surface/95 px-3.5 py-2.5 text-sm text-text-muted shadow-sm rotate-[-1.5deg]"
							>
								<span class="font-medium">WhatsApp</span>
								<span class="tracking-widest text-text-faint">— — —</span>
							</div>
							<div
								class="hero-float-card flex w-[min(100%,14.5rem)] translate-x-4 items-center justify-between rounded-lg border border-border bg-surface/95 px-3.5 py-2.5 text-sm text-text-muted shadow-sm rotate-[1.1deg] sm:translate-x-6"
							>
								<span class="font-medium">Excel</span>
								<span class="tracking-widest text-text-faint">— — —</span>
							</div>
							<div
								class="hero-float-card flex w-[min(100%,14.5rem)] -translate-x-1 items-center justify-between rounded-lg border border-border bg-surface/95 px-3.5 py-2.5 text-sm text-text-muted shadow-sm rotate-[-0.7deg]"
							>
								<span class="font-medium">{t('hub.hero.chaos.chatGroup')}</span>
								<span class="tracking-widest text-text-faint">— — —</span>
							</div>
						</div>

						<!-- Connector -->
						<div class="relative my-1 flex h-10 items-center justify-center">
							<svg
								class="absolute inset-x-0 mx-auto h-full w-16 text-border"
								viewBox="0 0 64 40"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M32 2 v28"
									stroke="currentColor"
									stroke-width="1.5"
									stroke-dasharray="3 3"
								/>
								<path d="M24 26 l8 8 8-8" stroke="currentColor" stroke-width="1.5" />
							</svg>
							<span
								class="relative z-10 flex size-7 items-center justify-center rounded-full border border-brand/30 bg-surface text-brand shadow-sm"
							>
								<ArrowDown class="size-3.5" />
							</span>
						</div>

						<!-- App panel + side float cards -->
						<div class="relative">
							<div
								class="hero-float-card absolute -left-1 top-8 z-10 hidden w-28 rounded-md border border-border bg-surface p-2 shadow-sm rotate-[-6deg] sm:block lg:-left-4"
							>
								<div class="mb-1.5 h-1.5 w-10 rounded bg-border"></div>
								<div class="space-y-1">
									<div class="h-1 w-full rounded bg-border/80"></div>
									<div class="h-1 w-4/5 rounded bg-border/80"></div>
									<div class="h-1 w-3/5 rounded bg-brand/40"></div>
								</div>
							</div>
							<div
								class="hero-float-card absolute -right-1 top-14 z-10 hidden w-24 rounded-md border border-border bg-surface p-2 shadow-sm rotate-[5deg] sm:block lg:-right-3"
							>
								<div class="mb-1.5 flex gap-0.5">
									<span class="h-6 flex-1 rounded-sm bg-border/70"></span>
									<span class="h-6 flex-1 rounded-sm bg-border/50"></span>
									<span class="h-6 flex-1 rounded-sm bg-brand/35"></span>
								</div>
								<div class="h-1 w-full rounded bg-border/70"></div>
							</div>

							<div
								class="relative overflow-hidden rounded-xl border border-border bg-surface shadow-[0_20px_50px_-28px_rgba(0,0,0,0.35)] dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.7)]"
							>
								<div class="flex items-center gap-1.5 border-b border-border px-3.5 py-2.5">
									<span class="size-2 rounded-full bg-border"></span>
									<span class="size-2 rounded-full bg-border"></span>
									<span class="size-2 rounded-full bg-border"></span>
								</div>
								<div class="flex min-h-48">
									<div class="flex w-14 flex-col gap-2 border-r border-border bg-surface-2/60 p-2.5 sm:w-16">
										<div class="h-1.5 w-full rounded bg-border"></div>
										<div class="h-1.5 w-[88%] rounded bg-brand"></div>
										<div class="h-1.5 w-full rounded bg-border"></div>
										<div class="h-1.5 w-full rounded bg-border"></div>
										<div class="mt-auto h-1.5 w-3/4 rounded bg-border"></div>
									</div>
									<div class="flex flex-1 flex-col gap-2.5 p-3.5 sm:p-4">
										<div class="mb-1 flex items-center justify-between">
											<div class="h-2 w-24 rounded bg-text/15"></div>
											<div class="h-5 w-16 rounded-full bg-brand/20"></div>
										</div>
										<div class="h-2 w-[72%] rounded bg-border"></div>
										<div class="h-2 w-[90%] rounded bg-border"></div>
										<div class="mt-1 grid grid-cols-3 gap-2">
											<div class="h-14 rounded-md border border-border bg-surface-2/80"></div>
											<div class="h-14 rounded-md border border-border bg-surface-2/80"></div>
											<div class="h-14 rounded-md border border-brand/25 bg-brand/10"></div>
										</div>
										<div class="h-2 w-[55%] rounded bg-border"></div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
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
						<h2
							class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-tight"
						>
							{t('hub.apps.app.name')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.app.desc')}
						</p>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.app.outcome')}
						</p>
						<div class="mt-8">
							<a
								href="/app/"
								class="inline-flex items-center justify-center rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
							>
								{t('hub.apps.app.ctaFeaturesPage')}
							</a>
						</div>
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
						<h2
							class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-tight"
						>
							{t('hub.apps.crm.name')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.crm.desc')}
						</p>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.apps.crm.outcome')}
						</p>
						<div class="mt-8">
							<a
								href="/crm/"
								class="inline-flex items-center justify-center rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
							>
								{t('hub.apps.crm.ctaFeaturesPage')}
							</a>
						</div>
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

			<div
				id="tools"
				class="hub-stage scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-[var(--stage-border)]"
			>
				<div
					class="flex flex-col items-center gap-8 p-8 text-left sm:p-10 lg:flex-row lg:gap-12 lg:p-12"
				>
					<div class="w-full lg:w-1/2">
						<span
							class="inline-flex items-center rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
						>
							{t('hub.nav.tools')}
						</span>
						<p class="mt-5 text-sm font-medium text-[var(--stage-fg)] sm:text-base">
							{t('hub.tools.problem')}
						</p>
						<h2
							class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-tight"
						>
							{t('hub.tools.title')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.tools.desc')}
						</p>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.tools.outcome')}
						</p>
						<div class="mt-8">
							<a
								href="/tools/"
								class="inline-flex items-center justify-center rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
							>
								{t('hub.tools.cta')}
							</a>
						</div>
					</div>
					<div class="flex w-full flex-col gap-3 lg:w-1/2">
						{#each tools as { titleKey, descKey, href } (titleKey)}
							<a
								{href}
								class="rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] p-4 text-left transition-colors hover:border-brand/40"
							>
								<h3 class="text-sm font-semibold text-[var(--stage-fg)]">{t(titleKey)}</h3>
								<p class="mt-1.5 text-xs leading-relaxed text-[var(--stage-muted)]">{t(descKey)}</p>
							</a>
						{/each}
					</div>
				</div>
			</div>

			<div
				id="resources"
				class="hub-stage scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-[var(--stage-border)]"
			>
				<div
					class="flex flex-col items-center gap-8 p-8 text-left sm:p-10 lg:flex-row-reverse lg:gap-12 lg:p-12"
				>
					<div class="w-full lg:w-1/2">
						<span
							class="inline-flex items-center rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand"
						>
							{t('hub.nav.resources')}
						</span>
						<p class="mt-5 text-sm font-medium text-[var(--stage-fg)] sm:text-base">
							{t('hub.resources.problem')}
						</p>
						<h2
							class="mt-3 text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-tight"
						>
							{t('hub.resources.title')}
						</h2>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.resources.desc')}
						</p>
						<p class="mt-3 text-sm leading-relaxed text-[var(--stage-muted)] sm:text-base">
							{t('hub.resources.outcome')}
						</p>
						<div class="mt-8">
							<a
								href="/resources/"
								class="inline-flex items-center justify-center rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
							>
								{t('hub.resources.ctaPrimary')}
							</a>
						</div>
					</div>
					<div class="hub-mock w-full lg:w-1/2" aria-hidden="true">
						<div class="hub-mock-chrome">
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
							<span class="hub-mock-dot"></span>
						</div>
						<div class="hub-mock-body">
							<div class="hub-mock-main w-full gap-3 p-4">
								<div class="hub-mock-row hub-mock-row--wide"></div>
								<div class="hub-mock-row"></div>
								<div class="mt-1 grid grid-cols-2 gap-2">
									<div class="h-16 rounded-md border border-[var(--stage-border)] bg-[var(--stage-bg)]"></div>
									<div class="h-16 rounded-md border border-brand/40 bg-brand/20"></div>
								</div>
								<div class="hub-mock-row hub-mock-row--short"></div>
								<div class="hub-mock-row hub-mock-row--wide"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- ── CTA BAND ── -->
	<section class="relative z-10 border-t border-border/40 px-6 py-16 sm:px-10 sm:py-20">
		<div class="mx-auto max-w-6xl">
			<div
				class="flex w-full flex-col items-center rounded-[1.5rem] bg-brand px-5 py-12 text-center text-primary-foreground sm:px-12 sm:py-16"
			>
				<BrandMark class="mb-5 h-10 w-10 text-white" title="" />
				<h2 class="text-[clamp(1.5rem,3.5vw,2.25rem)] font-semibold leading-[1.15] tracking-tight">
					{t('hub.ctaBand.title')}
				</h2>
				<p class="mt-3 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">
					{t('hub.ctaBand.subtitle')}
				</p>
				<div class="mt-8 flex w-full max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
					<a
						href={PUBLIC_APP_URL}
						class="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-[6px] bg-white px-4 text-sm font-medium text-brand transition-colors hover:bg-white/90 sm:w-auto sm:px-8"
					>
						{t('hub.ctaBand.cta')}
					</a>
					<a
						href={PUBLIC_CRM_URL}
						class="inline-flex h-11 w-full items-center justify-center whitespace-nowrap rounded-[6px] border border-white/40 bg-transparent px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-white/10 sm:w-auto sm:px-8"
					>
						{t('hub.ctaBand.ctaCrm')}
					</a>
				</div>
				<p
					class="mt-5 flex flex-col items-center gap-1.5 text-sm text-white/80 sm:inline-flex sm:flex-row"
				>
					<Lock class="size-3.5 shrink-0" aria-hidden="true" />
					<span class="text-center sm:text-left">{t('hub.ctaBand.trust')}</span>
				</p>
			</div>
		</div>
	</section>

	<!-- ── FOOTER ── -->
	<footer class="relative z-10 border-t border-border/40 px-6 py-12 sm:px-10">
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
							<a href="/app/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.webApp')}</a
							>
						</li>
						<li>
							<a href="/crm/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.crm')}</a
							>
						</li>
						<li>
							<a href="/tools/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.tools')}</a
							>
						</li>
						<li>
							<a href="/resources/" class="text-xs text-text-muted transition-colors hover:text-text"
								>{t('hub.nav.resources')}</a
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

	.hero-iso-grid {
		background-image:
			linear-gradient(to right, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px),
			linear-gradient(to bottom, color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px);
		background-size: 28px 28px;
		mask-image: radial-gradient(ellipse 70% 65% at 55% 45%, #000 20%, transparent 75%);
		transform: perspective(600px) rotateX(58deg) scale(1.35);
		transform-origin: center 40%;
	}
</style>
