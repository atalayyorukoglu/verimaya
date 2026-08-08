<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Tenant } from '@verimaya/shared';
	import { cn } from '$lib/utils';
	import { apiGet } from '$lib/api';
	import { mobileTabItems, navGroups } from '$lib/navigation';
	import { t } from '$lib/i18n/locale.svelte';
	import { canAccessPath, canSeeNav, DEFAULT_ROLE, roleLabels } from '$lib/rbac';
	import { useQueryScope, resetQueryScope } from '$lib/query-scope.svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import Menu from '@lucide/svelte/icons/menu';
	import X from '@lucide/svelte/icons/x';
	import { changelog } from '@verimaya/shared';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import SiteLogo from '$lib/components/SiteLogo.svelte';
	import SidebarVersionFooter from '$lib/components/SidebarVersionFooter.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';
	import { authClient } from '$lib/auth';
	import { USE_MSW } from '$lib/env';

	type BeforeInstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	const INSTALL_DISMISS_KEY = 'verimaya:install-prompt-dismissed';

	let { children }: { children: Snippet } = $props();

	let mobileOpen = $state(false);
	let hasUnreadChangelog = $state(false);
	let supportOpen = $state(false);
	let accountOpen = $state(false);
	let desktopNavEl: HTMLElement | undefined = $state();
	let mobileNavEl: HTMLElement | undefined = $state();
	let installPromptEvent = $state<BeforeInstallPromptEvent | null>(null);
	let installDismissed = $state(false);

	const pathname = $derived(page.url.pathname);
	const showInstallPrompt = $derived(!USE_MSW && installPromptEvent != null && !installDismissed);

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current')
	}));

	const role = $derived(qs.meQuery.data?.role ?? DEFAULT_ROLE);
	const queryClient = useQueryClient();

	const tenantName = $derived(tenantQuery.data?.name ?? 'Demo Klinik');

	const visibleGroups = $derived(
		navGroups
			.map((group) => ({
				...group,
				items: group.items.filter((item) => canSeeNav(item.href, role))
			}))
			.filter((group) => group.items.length > 0)
	);

	const visibleTabs = $derived(mobileTabItems.filter((item) => canSeeNav(item.href, role)));

	$effect(() => {
		const latest = changelog[0]?.version;
		if (!latest) {
			hasUnreadChangelog = false;
			return;
		}
		hasUnreadChangelog = localStorage.getItem('verimaya:last-seen-version') !== latest;
	});

	$effect(() => {
		if (USE_MSW) return;
		installDismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === '1';

		function onBeforeInstallPrompt(e: Event) {
			e.preventDefault();
			installPromptEvent = e as BeforeInstallPromptEvent;
		}

		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
	});

	async function acceptInstall() {
		const evt = installPromptEvent;
		if (!evt) return;
		await evt.prompt();
		await evt.userChoice;
		installPromptEvent = null;
	}

	function dismissInstall() {
		installDismissed = true;
		installPromptEvent = null;
		localStorage.setItem(INSTALL_DISMISS_KEY, '1');
	}

	$effect(() => {
		if (qs.meQuery.isPending) return;
		const path = page.url.pathname;
		if (!canAccessPath(path, role)) {
			void goto('/');
		}
	});

	const allNavHrefs = $derived([
		...navGroups.flatMap((g) => g.items.map((i) => i.href)),
		...mobileTabItems.map((i) => i.href)
	]);

	function isActive(href: string): boolean {
		if (href === '/') return pathname === '/';
		if (pathname === href) return true;
		if (!pathname.startsWith(`${href}/`)) return false;
		return !allNavHrefs.some(
			(other) =>
				other !== href &&
				other.startsWith(`${href}/`) &&
				(pathname === other || pathname.startsWith(`${other}/`))
		);
	}

	function closeMobile() {
		mobileOpen = false;
	}

	function closeAccount() {
		accountOpen = false;
	}

	async function signOut() {
		closeAccount();
		if (!USE_MSW) {
			await authClient.signOut();
		}
		// AUTH-01E / CACHE-01: cancel in-flight queries, then drop every cached query
		// (role, tenant, patients, …) so a subsequent sign-in in the same tab never
		// serves stale/cross-session data.
		await resetQueryScope(queryClient);
		await goto('/login');
	}

	/** TickPort: thin scrollbar only while scrolling */
	function bindSidebarScroll(el: HTMLElement) {
		let hideTimer: ReturnType<typeof setTimeout> | undefined;
		const showScrollbar = () => {
			el.classList.add('sidebar-nav-scroll--active');
			if (hideTimer) clearTimeout(hideTimer);
			hideTimer = setTimeout(() => {
				el.classList.remove('sidebar-nav-scroll--active');
			}, 900);
		};
		el.addEventListener('scroll', showScrollbar, { passive: true });
		return () => {
			el.removeEventListener('scroll', showScrollbar);
			if (hideTimer) clearTimeout(hideTimer);
			el.classList.remove('sidebar-nav-scroll--active');
		};
	}

	$effect(() => {
		const el = desktopNavEl;
		if (!el) return;
		return bindSidebarScroll(el);
	});

	$effect(() => {
		const el = mobileNavEl;
		if (!el) return;
		return bindSidebarScroll(el);
	});

	/** TickPort: lock document scroll on desktop so only main panes scroll */
	$effect(() => {
		const html = document.documentElement;
		const body = document.body;
		const prevHtml = html.style.overflow;
		const prevBody = body.style.overflow;
		const mq = window.matchMedia('(min-width: 768px)');

		function apply() {
			if (mq.matches) {
				html.style.overflow = 'hidden';
				body.style.overflow = 'hidden';
			} else {
				html.style.overflow = '';
				body.style.overflow = '';
			}
		}

		apply();
		mq.addEventListener('change', apply);
		return () => {
			mq.removeEventListener('change', apply);
			html.style.overflow = prevHtml;
			body.style.overflow = prevBody;
		};
	});
</script>

<svelte:window
	onclick={() => {
		if (accountOpen) accountOpen = false;
	}}
/>

<div
	class="flex min-h-dvh w-full flex-col bg-bg text-text md:h-dvh md:max-h-dvh md:min-h-0 md:flex-row md:overflow-hidden"
>
	{#if showInstallPrompt}
		<div
			class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 mx-3 mb-2 rounded-[8px] border border-border bg-surface p-3 shadow-lg md:right-4 md:bottom-4 md:left-auto md:mx-0 md:w-[22rem]"
			role="status"
		>
			<p class="text-sm font-medium text-text">Veri Maya’yı ana ekrana ekle</p>
			<p class="mt-1 text-xs leading-relaxed text-text-muted">
				Uygulamayı cihazınıza kurarak daha hızlı açabilirsiniz.
			</p>
			<div class="mt-3 flex items-center gap-2">
				<Button type="button" class="h-8 px-3 text-xs" onclick={() => void acceptInstall()}>
					Kur
				</Button>
				<button
					type="button"
					class="h-8 rounded-[6px] px-3 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					onclick={dismissInstall}
				>
					Şimdi değil
				</button>
			</div>
		</div>
	{/if}

	<!-- Desktop sidebar — TickPort: full viewport height, footer pinned -->
	<aside class="hidden h-full w-[220px] shrink-0 flex-col border-r border-border bg-bg md:flex">
		<div class="flex h-14 shrink-0 items-center border-b border-border bg-bg px-4">
			<a href="/" class="block min-w-0 rounded-md" aria-label="Veri Maya — {tenantName}">
				<SiteLogo />
			</a>
		</div>

		<nav
			bind:this={desktopNavEl}
			class="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3"
			aria-label="Ana menü"
		>
			{#each visibleGroups as group, gi (group.labelKey)}
				<div class={gi === 0 ? '' : 'mt-4'}>
					<p class="px-3 pb-1.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase">
						{t(group.labelKey)}
					</p>
					<ul class="space-y-0.5">
						{#each group.items as item (item.href)}
							{@const active = isActive(item.href)}
							{@const Icon = item.icon}
							<li>
								<a
									href={item.href}
									class={cn(
										'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
										active
											? 'bg-brand-subtle text-brand-text'
											: 'text-text-muted hover:bg-surface-2 hover:text-text'
									)}
									aria-current={active ? 'page' : undefined}
								>
									<Icon class="size-4 shrink-0" aria-hidden="true" />
									<span class="truncate">{t(item.labelKey)}</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</nav>

		<div
			class="shrink-0 border-t border-border bg-bg px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
		>
			<a
				href="/settings"
				class="mb-2 block truncate rounded-md px-1 py-1 text-center text-xs text-text-muted hover:text-text"
				title="demo@verimaya.app"
			>
				demo@verimaya.app
			</a>
			<SidebarVersionFooter />
		</div>
	</aside>

	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 bg-black/60 md:hidden"
			aria-label="Menüyü kapat"
			onclick={closeMobile}
		></button>
		<aside
			class="fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col border-r border-border bg-bg md:hidden"
		>
			<div class="flex h-14 shrink-0 items-center border-b border-border bg-bg px-4">
				<a
					href="/"
					class="block min-w-0 flex-1 rounded-md"
					aria-label="Veri Maya — {tenantName}"
					onclick={closeMobile}
				>
					<SiteLogo />
				</a>
				<button
					type="button"
					class="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text"
					aria-label="Kapat"
					onclick={closeMobile}
				>
					<X class="size-5" />
				</button>
			</div>
			<nav
				bind:this={mobileNavEl}
				class="sidebar-nav-scroll flex-1 overflow-y-auto px-2 py-3"
				aria-label="Tüm menü"
			>
				{#each visibleGroups as group, gi (group.labelKey)}
					<div class={gi === 0 ? '' : 'mt-4'}>
						<p
							class="px-3 pb-1.5 text-[10px] font-semibold tracking-wider text-text-muted uppercase"
						>
							{t(group.labelKey)}
						</p>
						<ul class="space-y-0.5">
							{#each group.items as item (item.href)}
								{@const active = isActive(item.href)}
								{@const Icon = item.icon}
								<li>
									<a
										href={item.href}
										onclick={closeMobile}
										class={cn(
											'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
											active
												? 'bg-brand-subtle text-brand-text'
												: 'text-text-muted hover:bg-surface-2 hover:text-text'
										)}
										aria-current={active ? 'page' : undefined}
									>
										<Icon class="size-4 shrink-0" aria-hidden="true" />
										<span class="truncate">{t(item.labelKey)}</span>
									</a>
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
			<div
				class="shrink-0 border-t border-border bg-bg px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
			>
				<a
					href="/settings"
					onclick={closeMobile}
					class="mb-2 block truncate rounded-md px-1 py-1 text-center text-xs text-text-muted hover:text-text"
					title="demo@verimaya.app"
				>
					demo@verimaya.app
				</a>
				<SidebarVersionFooter />
			</div>
		</aside>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col md:h-full md:min-h-0 md:overflow-hidden">
		<header
			class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/95 px-3 backdrop-blur sm:px-4 md:static"
		>
			<a
				href="/"
				class="shrink-0 rounded-md text-text md:hidden"
				aria-label="Veri Maya — {tenantName}"
			>
				<BrandMark class="h-7 w-7" title="" />
			</a>
			<CommandPalette />

			<div class="ml-auto flex shrink-0 items-center gap-1">
				<ThemeToggle />
				<a
					href="/changelog"
					class="relative rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					aria-label="Yenilikler"
					title="Yenilikler"
				>
					<Bell class="size-5" />
					{#if hasUnreadChangelog}
						<span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand" aria-hidden="true"
						></span>
					{/if}
				</a>
				<button
					type="button"
					class="hidden rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:inline-flex"
					aria-label="Destek"
					title="Destek"
					onclick={() => (supportOpen = true)}
				>
					<CircleHelp class="size-5" />
				</button>
				<div class="relative ml-1">
					<button
						type="button"
						class="flex size-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold text-text"
						aria-label="Hesap menüsü"
						aria-expanded={accountOpen}
						onclick={(e) => {
							e.stopPropagation();
							accountOpen = !accountOpen;
						}}
					>
						PF
					</button>
					{#if accountOpen}
						<div
							class="absolute right-0 z-40 mt-2 w-56 rounded-[8px] border border-border bg-surface py-1 shadow-lg"
						>
							<div class="border-b border-border px-3 py-2">
								<p class="truncate text-sm font-medium text-text">Demo Kullanıcı</p>
								<p class="truncate text-xs text-text-faint">demo@verimaya.app</p>
								<p class="mt-1 text-xs text-text-muted">Rol: {roleLabels[role]}</p>
							</div>
							{#if canSeeNav('/settings', role)}
								<a
									href="/settings"
									class="block px-3 py-2 text-sm text-text hover:bg-surface-2"
									onclick={closeAccount}
								>
									Ayarlar
								</a>
							{/if}
							<a
								href="/changelog"
								class="block px-3 py-2 text-sm text-text hover:bg-surface-2"
								onclick={closeAccount}
							>
								Yenilikler
							</a>
							<button
								type="button"
								class="block w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
								onclick={() => {
									closeAccount();
									supportOpen = true;
								}}
							>
								Destek
							</button>
							<button
								type="button"
								class="block w-full border-t border-border px-3 py-2 text-left text-sm text-danger hover:bg-surface-2"
								onclick={() => void signOut()}
							>
								Çıkış yap
							</button>
						</div>
					{/if}
				</div>
			</div>
		</header>

		{#if USE_MSW}
			<div
				class="shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning"
				role="status"
			>
				{t('demo.banner')}
			</div>
		{/if}

		<main
			class="min-w-0 flex-1 overflow-x-hidden p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-6 md:min-h-0 md:overflow-y-auto md:pb-6"
		>
			{@render children()}
		</main>
	</div>

	<nav
		class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
		style="padding-bottom: env(safe-area-inset-bottom)"
		aria-label="Alt menü"
	>
		<ul class="flex h-14">
			{#each visibleTabs as item (item.href)}
				{@const active = isActive(item.href)}
				{@const Icon = item.icon}
				<li class="min-w-0 flex-1">
					<a
						href={item.href}
						class={cn(
							'flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors',
							active ? 'text-brand' : 'text-text-muted'
						)}
						aria-current={active ? 'page' : undefined}
					>
						<Icon class="size-5 shrink-0" aria-hidden="true" />
						<span class="truncate">{t(item.labelKey)}</span>
					</a>
				</li>
			{/each}
			<li class="min-w-0 flex-1">
				<button
					type="button"
					class={cn(
						'flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors',
						mobileOpen ? 'text-brand' : 'text-text-muted'
					)}
					aria-label="Menü"
					aria-expanded={mobileOpen}
					onclick={() => (mobileOpen = !mobileOpen)}
				>
					<Menu class="size-5 shrink-0" aria-hidden="true" />
					<span>Menü</span>
				</button>
			</li>
		</ul>
	</nav>
</div>

<Dialog
	bind:open={supportOpen}
	title="Destek"
	description="Demo ortamı — gerçek destek kanalı yok."
>
	<div class="space-y-3 text-sm text-text-muted">
		<p>
			Sorun veya geri bildirim için geliştiriciye yazın. Üretimde bu ekran ticket / e-posta formuna
			bağlanacak.
		</p>
		<p>
			<a class="font-medium text-brand hover:underline" href="mailto:destek@verimaya.app"
				>destek@verimaya.app</a
			>
		</p>
	</div>
	{#snippet footer()}
		<Button type="button" onclick={() => (supportOpen = false)}>Kapat</Button>
	{/snippet}
</Dialog>
