<script lang="ts">
	import BrandMark from '$lib/components/BrandMark.svelte';
	import HubI18nText from '$lib/components/HubI18nText.svelte';
	import LocaleToggle from '$lib/components/LocaleToggle.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { PUBLIC_APP_URL, PUBLIC_SITE_URL } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';
	import { messages, type MessageKey } from '$lib/i18n/messages';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import LockKeyhole from '@lucide/svelte/icons/lock-keyhole';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';

	let menuOpen = $state(false);

	const title = $derived(t('hubHome.meta.title'));
	const description = $derived(t('hubHome.meta.description'));
	const canonical = `${PUBLIC_SITE_URL}/`;
	const ogImage = `${PUBLIC_SITE_URL}/og/vitrin.png`;
	const appLoginUrl = `${PUBLIC_APP_URL}/login`;

	const organizationLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: 'Verimaya',
		url: PUBLIC_SITE_URL,
		logo: `${PUBLIC_SITE_URL}/icon-512.png`,
		description
	});

	const navItems = [
		{ href: '#ne-yapar', labelKey: 'hubHome.nav.what' as MessageKey },
		{ href: '#kimin-icin', labelKey: 'hubHome.nav.forWhom' as MessageKey },
		{ href: '#araclar', labelKey: 'hubHome.nav.tools' as MessageKey },
		{ href: '/resources/', labelKey: 'hubHome.nav.resources' as MessageKey }
	] as const;

	const questions = [
		'hubHome.questions.revenue',
		'hubHome.questions.untouched',
		'hubHome.questions.commission'
	] as const satisfies readonly MessageKey[];

	const steps = [
		{
			titleKey: 'hubHome.how.ads' as MessageKey,
			descriptionKey: 'hubHome.how.adsDesc' as MessageKey,
			badgeKey: null,
			badgeClass: ''
		},
		{
			titleKey: 'hubHome.how.lead' as MessageKey,
			descriptionKey: 'hubHome.how.leadDesc' as MessageKey,
			badgeKey: 'hubHome.how.salesBadge' as MessageKey,
			badgeClass: 'border-blue-400/30 bg-blue-500/10 text-blue-300'
		},
		{
			titleKey: 'hubHome.how.patient' as MessageKey,
			descriptionKey: 'hubHome.how.patientDesc' as MessageKey,
			badgeKey: 'hubHome.how.opsBadge' as MessageKey,
			badgeClass: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
		},
		{
			titleKey: 'hubHome.how.collection' as MessageKey,
			descriptionKey: 'hubHome.how.collectionDesc' as MessageKey,
			badgeKey: null,
			badgeClass: ''
		}
	] as const;

	const tools = [
		{
			titleKey: 'hubHome.tools.calculator.title' as MessageKey,
			descriptionKey: 'hubHome.tools.calculator.desc' as MessageKey,
			href: '/tools/calculator/'
		},
		{
			titleKey: 'hubHome.tools.measurement.title' as MessageKey,
			descriptionKey: 'hubHome.tools.measurement.desc' as MessageKey,
			href: '/tools/measurement/'
		},
		{
			titleKey: 'hubHome.tools.preLaunch.title' as MessageKey,
			descriptionKey: 'hubHome.tools.preLaunch.desc' as MessageKey,
			href: '/tools/pre-launch/'
		},
		{
			titleKey: 'hubHome.tools.templates.title' as MessageKey,
			descriptionKey: 'hubHome.tools.templates.desc' as MessageKey,
			href: '/tools/templates/'
		}
	] as const;

	function closeMenu() {
		menuOpen = false;
	}

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function preventSubmit(event: SubmitEvent) {
		event.preventDefault();
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
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Verimaya" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={ogImage} />

	<!-- eslint-disable-next-line svelte/no-at-html-tags, no-useless-escape -- statik ve güvenli JSON-LD -->
	{@html `<script type="application/ld+json">${JSON.stringify(organizationLd).replace(/</g, '\\u003c')}<\/script>`}
</svelte:head>

<div
	class="hub-page relative overflow-hidden bg-bg text-text"
	style="--brand: #f43e01; --brand-hover: #d93601; --brand-subtle: rgba(244, 62, 1, 0.14); --brand-text: #b32e01; --gradient-hero: linear-gradient(135deg, #f43e01, #ff6a33); --primary: var(--brand); --ring: var(--brand)"
>
	<div class="pointer-events-none absolute inset-0" aria-hidden="true">
		<div class="hub-wash absolute inset-0"></div>
		<div class="hub-glow absolute -top-[20%] left-1/2 h-[70vh] w-[120vw] -translate-x-1/2"></div>
		<div class="hub-grain absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"></div>
	</div>

	<header class="relative z-20 border-b border-border/40 px-5 py-4 sm:px-10">
		<div class="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
			<a href="/" class="flex min-w-0 items-center gap-2 text-text" onclick={closeMenu}>
				<BrandMark class="size-7 shrink-0 text-text" title="" />
				<span class="text-sm font-semibold">Verimaya</span>
			</a>

			<nav class="hidden items-center gap-6 text-sm font-medium text-text-muted lg:flex">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="inline-flex min-h-11 items-center transition-colors hover:text-text"
					>
						<HubI18nText key={item.labelKey} />
					</a>
				{/each}
			</nav>

			<div class="flex items-center gap-1 sm:gap-2">
				<LocaleToggle />
				<ThemeToggle />
				<a
					href={appLoginUrl}
					class="hidden min-h-11 items-center rounded-[6px] bg-brand px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover sm:inline-flex"
				>
					<HubI18nText key="hubHome.nav.login" />
				</a>
				<button
					type="button"
					data-hub-menu-toggle
					data-label-open={t('hubHome.menu.open')}
					data-label-close={t('hubHome.menu.close')}
					class="inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text lg:hidden"
					aria-expanded={menuOpen}
					aria-controls="hub-home-mobile-nav"
					aria-label={menuOpen ? t('hubHome.menu.close') : t('hubHome.menu.open')}
					onclick={toggleMenu}
				>
					<span data-hub-menu-icon-open class={menuOpen ? 'hidden' : ''}>
						<Menu class="size-5" aria-hidden="true" />
					</span>
					<span data-hub-menu-icon-close class={menuOpen ? '' : 'hidden'}>
						<X class="size-5" aria-hidden="true" />
					</span>
				</button>
			</div>
		</div>

		<nav
			id="hub-home-mobile-nav"
			data-hub-mobile-nav
			class={menuOpen
				? 'mx-auto mt-4 flex w-full max-w-6xl flex-col border-t border-border/40 pt-3 lg:hidden'
				: 'hidden'}
		>
			{#each navItems as item (item.href)}
				<a
					href={item.href}
					class="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text"
					onclick={closeMenu}
				>
					<HubI18nText key={item.labelKey} />
				</a>
			{/each}
			<a
				href={appLoginUrl}
				class="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-text-muted hover:bg-surface-2 hover:text-text sm:hidden"
			>
				<HubI18nText key="hubHome.nav.login" />
			</a>
		</nav>

		<p
			class="mx-auto mt-3 max-w-6xl text-[11px] font-medium tracking-wide text-text-faint sm:text-xs"
		>
			<HubI18nText key="hubHome.category" />
		</p>
	</header>

	<main class="relative z-10">
		<section id="ne-yapar" class="scroll-mt-24 px-5 py-16 sm:px-10 sm:py-24 lg:py-28">
			<div
				class="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16"
			>
				<div>
					<p class="inline-flex rounded-full bg-brand/15 px-3 py-1 text-xs font-medium text-brand">
						<HubI18nText key="hubHome.category" />
					</p>
					<h1
						class="mt-5 max-w-[19ch] text-[clamp(2.35rem,7vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-text"
					>
						<HubI18nText key="hubHome.hero.title" />
					</h1>
					<p class="mt-6 max-w-2xl text-base leading-relaxed text-text-muted sm:text-lg">
						<HubI18nText key="hubHome.hero.subtitle" />
					</p>
					<a
						href="#ilk-bulgu"
						class="mt-8 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[6px] bg-brand px-5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover sm:w-auto"
					>
						<HubI18nText key="hubHome.cta.primary" />
						<ArrowRight class="size-4 shrink-0" aria-hidden="true" />
					</a>
				</div>

				<div class="relative mx-auto w-full max-w-lg" aria-hidden="true">
					<div class="hero-grid absolute -inset-8 opacity-70"></div>
					<div
						class="relative rounded-[1.5rem] border border-border bg-surface p-4 shadow-xl sm:p-6"
					>
						<div class="mb-5 flex items-center gap-1.5 border-b border-border pb-4">
							<span class="size-2 rounded-full bg-border"></span>
							<span class="size-2 rounded-full bg-border"></span>
							<span class="size-2 rounded-full bg-border"></span>
						</div>
						<div class="space-y-3">
							{#each [40, 67, 52, 82] as width (width)}
								<div class="rounded-lg border border-border bg-surface-2 p-3">
									<div class="h-2 rounded bg-border" style:width={`${width}%`}></div>
									<div class="mt-3 h-1.5 w-2/5 rounded bg-brand/35"></div>
								</div>
							{/each}
						</div>
						<div class="mt-5 grid grid-cols-3 gap-2">
							<div class="h-16 rounded-lg border border-border bg-surface-2"></div>
							<div class="h-16 rounded-lg border border-border bg-surface-2"></div>
							<div class="h-16 rounded-lg border border-brand/30 bg-brand/10"></div>
						</div>
					</div>
				</div>
			</div>
		</section>

		<section class="border-y border-border/40 bg-surface/55 px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto max-w-6xl">
				<p class="text-xs font-semibold tracking-wider text-brand uppercase">
					<HubI18nText key="hubHome.questions.eyebrow" />
				</p>
				<h2 class="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
					<HubI18nText key="hubHome.questions.title" />
				</h2>
				<div class="mt-8 grid gap-4 md:grid-cols-3">
					{#each questions as question, index (question)}
						<article class="rounded-xl border border-border bg-bg p-5 sm:p-6">
							<span class="text-xs font-semibold text-brand">0{index + 1}</span>
							<h3 class="mt-8 text-lg leading-snug font-semibold">
								<HubI18nText key={question} />
							</h3>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<section class="px-5 py-14 sm:px-10 sm:py-20">
			<div
				class="mx-auto grid max-w-6xl gap-8 rounded-[1.5rem] border border-border bg-surface p-6 sm:p-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-center lg:p-12"
			>
				<div
					class="flex size-20 items-center justify-center rounded-2xl bg-brand/15 text-3xl font-semibold text-brand"
				>
					10
				</div>
				<div>
					<p class="text-xs font-semibold tracking-wider text-brand uppercase">
						<HubI18nText key="hubHome.finding.eyebrow" />
					</p>
					<h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
						<HubI18nText key="hubHome.finding.title" />
					</h2>
					<p class="mt-4 max-w-3xl leading-relaxed text-text-muted">
						<HubI18nText key="hubHome.finding.description" />
					</p>
					<a
						href="#ilk-bulgu"
						class="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
					>
						<HubI18nText key="hubHome.cta.primary" />
						<ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>

		<section class="px-5 py-14 sm:px-10 sm:py-20">
			<div
				class="hub-stage mx-auto max-w-6xl rounded-[1.5rem] border border-[var(--stage-border)] p-6 sm:p-10 lg:p-12"
			>
				<p class="text-xs font-semibold tracking-wider text-brand uppercase">
					<HubI18nText key="hubHome.how.eyebrow" />
				</p>
				<h2 class="mt-3 max-w-2xl text-2xl font-semibold tracking-tight sm:text-4xl">
					<HubI18nText key="hubHome.how.title" />
				</h2>

				<ol class="mt-10 grid gap-3 lg:grid-cols-4">
					{#each steps as step, index (step.titleKey)}
						<li
							class="relative rounded-xl border border-[var(--stage-border)] bg-[var(--stage-surface)] p-5"
						>
							<div class="flex items-start justify-between gap-3">
								<span class="text-xs font-semibold text-[var(--stage-faint)]">0{index + 1}</span>
								{#if step.badgeKey}
									<span
										class={`rounded-full border px-2 py-1 text-[11px] font-semibold ${step.badgeClass}`}
									>
										<HubI18nText key={step.badgeKey} />
									</span>
								{/if}
							</div>
							<h3 class="mt-8 text-lg font-semibold text-[var(--stage-fg)]">
								<HubI18nText key={step.titleKey} />
							</h3>
							<p class="mt-2 text-sm leading-relaxed text-[var(--stage-muted)]">
								<HubI18nText key={step.descriptionKey} />
							</p>
							{#if index < steps.length - 1}
								<ArrowRight
									class="absolute top-1/2 -right-3 z-10 hidden size-5 text-brand lg:block"
									aria-hidden="true"
								/>
							{/if}
						</li>
					{/each}
				</ol>

				<div class="mt-8 grid gap-3 text-sm text-[var(--stage-muted)] lg:grid-cols-2">
					<p class="rounded-lg border border-[var(--stage-border)] p-4">
						<HubI18nText key="hubHome.how.incentive" />
					</p>
					<p class="rounded-lg border border-[var(--stage-border)] p-4">
						<HubI18nText key="hubHome.how.ghlNote" />
					</p>
				</div>
			</div>
		</section>

		<section id="kimin-icin" class="scroll-mt-24 px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.3fr_0.7fr]">
				<article class="rounded-[1.5rem] border border-brand/25 bg-brand/10 p-6 sm:p-10">
					<p class="text-xs font-semibold tracking-wider text-brand uppercase">
						<HubI18nText key="hubHome.audience.eyebrow" />
					</p>
					<h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
						<HubI18nText key="hubHome.audience.title" />
					</h2>
					<p class="mt-5 max-w-3xl leading-relaxed text-text-muted">
						<HubI18nText key="hubHome.audience.agency" />
					</p>
					<a
						href="#ilk-bulgu"
						class="mt-7 inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
					>
						<HubI18nText key="hubHome.cta.primary" />
						<ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</article>
				<aside
					class="flex items-center rounded-[1.5rem] border border-border bg-surface p-6 sm:p-8"
				>
					<p class="leading-relaxed text-text-muted">
						<HubI18nText key="hubHome.audience.clinic" />
					</p>
				</aside>
			</div>
		</section>

		<section class="px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto max-w-6xl">
				<p class="text-xs font-semibold tracking-wider text-brand uppercase">
					<HubI18nText key="hubHome.why.eyebrow" />
				</p>
				<h2 class="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
					<HubI18nText key="hubHome.why.title" />
				</h2>
				<div class="mt-10 grid gap-5 md:grid-cols-2">
					<article class="rounded-[1.5rem] border border-border bg-surface p-6 sm:p-8">
						<h3 class="text-lg font-semibold text-text-muted">
							<HubI18nText key="hubHome.why.othersLabel" />
						</h3>
						<p class="mt-3 leading-relaxed text-text-muted">
							<HubI18nText key="hubHome.why.othersDesc" />
						</p>
					</article>
					<article class="rounded-[1.5rem] border border-brand/30 bg-brand/10 p-6 sm:p-8">
						<h3 class="text-lg font-semibold text-text">
							<HubI18nText key="hubHome.why.usLabel" />
						</h3>
						<p class="mt-3 leading-relaxed text-text-muted">
							<HubI18nText key="hubHome.why.usDesc" />
						</p>
					</article>
				</div>
				<a
					href="#ilk-bulgu"
					class="mt-7 inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
				>
					<HubI18nText key="hubHome.cta.primary" />
					<ArrowRight class="size-4" aria-hidden="true" />
				</a>
			</div>
		</section>

		<section class="border-y border-border/40 bg-surface/55 px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
				<div>
					<div class="flex size-12 items-center justify-center rounded-xl bg-brand/15 text-brand">
						<LockKeyhole class="size-6" aria-hidden="true" />
					</div>
					<p class="mt-6 text-xs font-semibold tracking-wider text-brand uppercase">
						<HubI18nText key="hubHome.privacy.eyebrow" />
					</p>
					<h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-4xl">
						<HubI18nText key="hubHome.privacy.title" />
					</h2>
				</div>
				<div class="space-y-4">
					{#each ['hubHome.privacy.isolation', 'hubHome.privacy.boundaries', 'hubHome.privacy.transparency'] as item (item)}
						<p
							class="flex gap-3 rounded-xl border border-border bg-bg p-5 leading-relaxed text-text-muted"
						>
							<Check class="mt-1 size-4 shrink-0 text-brand" aria-hidden="true" />
							<HubI18nText key={item as MessageKey} />
						</p>
					{/each}
					<a
						href="#ilk-bulgu"
						class="inline-flex min-h-11 items-center gap-2 rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
					>
						<HubI18nText key="hubHome.cta.primary" />
						<ArrowRight class="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>

		<section id="araclar" class="scroll-mt-24 px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto max-w-6xl">
				<p class="text-xs font-semibold tracking-wider text-brand uppercase">
					<HubI18nText key="hubHome.tools.eyebrow" />
				</p>
				<h2 class="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-4xl">
					<HubI18nText key="hubHome.tools.title" />
				</h2>
				<p class="mt-4 max-w-2xl leading-relaxed text-text-muted">
					<HubI18nText key="hubHome.tools.description" />
				</p>
				<div class="mt-9 grid gap-4 sm:grid-cols-2">
					{#each tools as tool (tool.href)}
						<article class="flex flex-col rounded-xl border border-border bg-surface p-5 sm:p-6">
							<h3 class="text-lg font-semibold">
								<HubI18nText key={tool.titleKey} />
							</h3>
							<p class="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
								<HubI18nText key={tool.descriptionKey} />
							</p>
							<div class="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
								<a
									href="#ilk-bulgu"
									class="inline-flex min-h-11 items-center justify-center rounded-[6px] bg-brand px-4 text-sm font-medium text-primary-foreground hover:bg-brand-hover"
								>
									<HubI18nText key="hubHome.tools.request" />
								</a>
								<a
									href={tool.href}
									class="inline-flex min-h-11 items-center justify-center rounded-[6px] px-3 text-sm font-medium text-text-muted underline-offset-4 hover:text-text hover:underline"
								>
									<HubI18nText key="hubHome.tools.open" />
								</a>
							</div>
						</article>
					{/each}
				</div>
			</div>
		</section>

		<section id="ilk-bulgu" class="scroll-mt-12 px-5 py-14 sm:px-10 sm:py-20">
			<div class="mx-auto grid max-w-6xl overflow-hidden rounded-[1.5rem] bg-brand lg:grid-cols-2">
				<div class="p-6 text-primary-foreground sm:p-10 lg:p-12">
					<p class="text-xs font-semibold tracking-wider text-white/70 uppercase">
						<HubI18nText key="hubHome.closing.eyebrow" />
					</p>
					<h2 class="mt-4 text-2xl leading-tight font-semibold tracking-tight sm:text-4xl">
						<HubI18nText key="hubHome.closing.title" />
					</h2>
					<p
						class="mt-6 rounded-lg border border-white/25 bg-white/10 p-4 text-sm font-medium text-white"
					>
						<HubI18nText key="hubHome.closing.capacity" />
					</p>
				</div>

				<form
					class="bg-surface p-6 sm:p-10 lg:p-12"
					aria-labelledby="first-finding-form-title"
					onsubmit={preventSubmit}
				>
					<h3 id="first-finding-form-title" class="text-xl font-semibold">
						<HubI18nText key="hubHome.form.title" />
					</h3>
					<p class="mt-2 text-sm leading-relaxed text-text-muted">
						<HubI18nText key="hubHome.form.description" />
					</p>

					<div class="mt-7 grid gap-5">
						<label class="grid gap-2 text-sm font-medium" for="first-finding-name">
							<HubI18nText key="hubHome.form.name" />
							<input
								id="first-finding-name"
								name="name"
								type="text"
								autocomplete="name"
								required
								class="min-h-11 w-full rounded-[6px] border border-border bg-bg px-3 text-base text-text transition-shadow outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
							/>
						</label>

						<label class="grid gap-2 text-sm font-medium" for="first-finding-company">
							<HubI18nText key="hubHome.form.company" />
							<input
								id="first-finding-company"
								name="company"
								type="text"
								autocomplete="organization"
								required
								class="min-h-11 w-full rounded-[6px] border border-border bg-bg px-3 text-base text-text transition-shadow outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
							/>
						</label>

						<label class="grid gap-2 text-sm font-medium" for="first-finding-budget">
							<HubI18nText key="hubHome.form.budget" />
							<select
								id="first-finding-budget"
								name="monthly_media_budget"
								required
								class="min-h-11 w-full rounded-[6px] border border-border bg-bg px-3 text-base text-text transition-shadow outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
							>
								<option
									value=""
									disabled
									selected
									data-i18n-tr={messages.tr['hubHome.form.budget.choose']}
									data-i18n-en={messages.en['hubHome.form.budget.choose']}
									>{t('hubHome.form.budget.choose')}</option
								>
								<option
									value="under-100k"
									data-i18n-tr={messages.tr['hubHome.form.budget.low']}
									data-i18n-en={messages.en['hubHome.form.budget.low']}
									>{t('hubHome.form.budget.low')}</option
								>
								<option
									value="100k-300k"
									data-i18n-tr={messages.tr['hubHome.form.budget.medium']}
									data-i18n-en={messages.en['hubHome.form.budget.medium']}
									>{t('hubHome.form.budget.medium')}</option
								>
								<option
									value="300k-750k"
									data-i18n-tr={messages.tr['hubHome.form.budget.high']}
									data-i18n-en={messages.en['hubHome.form.budget.high']}
									>{t('hubHome.form.budget.high')}</option
								>
								<option
									value="over-750k"
									data-i18n-tr={messages.tr['hubHome.form.budget.enterprise']}
									data-i18n-en={messages.en['hubHome.form.budget.enterprise']}
									>{t('hubHome.form.budget.enterprise')}</option
								>
							</select>
						</label>

						<label class="grid gap-2 text-sm font-medium" for="first-finding-system">
							<HubI18nText key="hubHome.form.system" />
							<input
								id="first-finding-system"
								name="current_system"
								type="text"
								autocomplete="off"
								required
								class="min-h-11 w-full rounded-[6px] border border-border bg-bg px-3 text-base text-text transition-shadow outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
							/>
						</label>

						<label
							class="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border bg-bg p-3 text-sm leading-relaxed text-text-muted"
							for="first-finding-consent"
						>
							<input
								id="first-finding-consent"
								name="kvkk_consent"
								type="checkbox"
								required
								class="mt-0.5 size-5 shrink-0 accent-brand"
							/>
							<span>
								<HubI18nText key="hubHome.form.consent.before" />
								<a
									href="/kvkk-aydinlatma/"
									class="font-medium text-text underline underline-offset-2 hover:text-brand"
									target="_blank"
									rel="noopener noreferrer"
								>
									<HubI18nText key="hubHome.footer.kvkk" />
								</a>
								<HubI18nText key="hubHome.form.consent.after" />
							</span>
						</label>

						<button
							type="submit"
							disabled
							class="inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-[6px] bg-brand px-5 text-sm font-medium text-primary-foreground opacity-55"
						>
							<HubI18nText key="hubHome.form.submitSoon" />
						</button>
					</div>
				</form>
			</div>
		</section>
	</main>

	<footer class="relative z-10 border-t border-border/40 px-5 py-10 sm:px-10">
		<div
			class="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
		>
			<a href="/" class="flex items-center gap-2 text-text">
				<BrandMark class="size-6 text-text" title="" />
				<span class="text-sm font-semibold">Verimaya</span>
			</a>
			<div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-muted">
				<a href="/resources/" class="inline-flex min-h-11 items-center hover:text-text">
					<HubI18nText key="hubHome.nav.resources" />
				</a>
				<a href="/kvkk-aydinlatma/" class="inline-flex min-h-11 items-center hover:text-text">
					<HubI18nText key="hubHome.footer.kvkk" />
				</a>
			</div>
			<p class="text-xs text-text-faint">
				© {new Date().getFullYear()}
				<HubI18nText key="hubHome.footer.copyright" />
			</p>
		</div>
	</footer>
</div>

<style>
	.hub-wash {
		background:
			radial-gradient(
				ellipse 80% 55% at 50% -10%,
				color-mix(in srgb, var(--brand) 14%, transparent),
				transparent 70%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 94%, #f0ebe6) 0%, var(--bg) 55%);
	}

	:global(.dark) .hub-wash {
		background:
			radial-gradient(
				ellipse 80% 55% at 50% -10%,
				color-mix(in srgb, var(--brand) 18%, transparent),
				transparent 70%
			),
			linear-gradient(180deg, color-mix(in srgb, var(--bg) 90%, #2a2420) 0%, var(--bg) 60%);
	}

	.hub-glow {
		background: var(--gradient-hero);
		opacity: 0.1;
		filter: blur(64px);
	}

	:global(.dark) .hub-glow {
		opacity: 0.14;
	}

	.hub-grain {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		mix-blend-mode: multiply;
	}

	:global(.dark) .hub-grain {
		mix-blend-mode: soft-light;
	}

	.hero-grid {
		background-image:
			linear-gradient(
				to right,
				color-mix(in srgb, var(--border) 70%, transparent) 1px,
				transparent 1px
			),
			linear-gradient(
				to bottom,
				color-mix(in srgb, var(--border) 70%, transparent) 1px,
				transparent 1px
			);
		background-size: 28px 28px;
		mask-image: radial-gradient(ellipse 70% 65% at 55% 45%, #000 20%, transparent 75%);
		transform: perspective(600px) rotateX(58deg) scale(1.35);
		transform-origin: center 40%;
	}

	.hub-stage {
		--stage-bg: #1a1a19;
		--stage-fg: #ededec;
		--stage-muted: #a1a19e;
		--stage-faint: #777773;
		--stage-border: #333332;
		--stage-surface: #242423;
		background: var(--stage-bg);
		color: var(--stage-fg);
	}
</style>
