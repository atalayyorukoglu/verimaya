<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import type { Tenant } from '@verimaya/shared';
	import { cn } from '$lib/utils';
	import { apiGet } from '$lib/api';
	import {
		buildNavGroups,
		mayaNavItem,
		mobileTabItems,
		navGroupItems,
		PANEL_HOME_HREF
	} from '$lib/navigation';
	import {
		getEnabledProductNavItems,
		applyServerProductModules
	} from '$lib/product-modules.svelte';
	import { filterDevPanelNavItems, canAccessPlatformPanel } from '$lib/dev-panel';
	import { DEV_PANEL_ENABLED } from '$lib/dev-panel-enabled';
	import { t } from '$lib/i18n/locale.svelte';
	import { canAccessPath, canSeeNav, DEFAULT_ROLE } from '$lib/rbac';
	import { useQueryScope, resetQueryScope } from '$lib/query-scope.svelte';
	import Bell from '@lucide/svelte/icons/bell';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FlaskConical from '@lucide/svelte/icons/flask-conical';
	import Menu from '@lucide/svelte/icons/menu';
	import PanelLeft from '@lucide/svelte/icons/panel-left';
	import X from '@lucide/svelte/icons/x';
	import { changelog } from '@verimaya/shared';
	import CommandPalette from '$lib/components/CommandPalette.svelte';
	import BrandMark from '$lib/components/BrandMark.svelte';
	import SidebarVersionFooter from '$lib/components/SidebarVersionFooter.svelte';
	import MayaAiFab from '$lib/components/MayaAiFab.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { Snippet } from 'svelte';
	import { authClient } from '$lib/auth';
	import { listUserOrganizations, setActiveOrganization } from '$lib/auth-org';
	import { USE_MSW } from '$lib/env';
	import { isDemoChromeVisible, toggleDemoChrome } from '$lib/demo-chrome.svelte';

	type BeforeInstallPromptEvent = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	const INSTALL_DISMISS_KEY = 'verimaya:install-prompt-dismissed';
	const SIDEBAR_COLLAPSED_KEY = 'verimaya:sidebar-collapsed';

	let { children }: { children: Snippet } = $props();

	let mobileOpen = $state(false);
	let hasUnreadChangelog = $state(false);
	let supportOpen = $state(false);

	/** Tek kaynak — hem mailto hem görünen metin buradan gelir. */
	const SUPPORT_EMAIL = 'destek@verimaya.com';
	let orgSwitching = $state(false);
	let orgSwitchError = $state<string | null>(null);
	let accountMenuOpen = $state(false);
	let sidebarCollapsed = $state(
		typeof localStorage !== 'undefined' && localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
	);
	let desktopNavEl: HTMLElement | undefined = $state();
	let mobileNavEl: HTMLElement | undefined = $state();
	let installPromptEvent = $state<BeforeInstallPromptEvent | null>(null);
	let installDismissed = $state(false);

	const pathname = $derived(page.url.pathname);
	/** Contact detail is a full-bleed chat layout — shell padding would inset the sticky chrome. */
	const flushMain = $derived(/^\/contacts\/[^/]+\/?$/.test(pathname));
	const showInstallPrompt = $derived(!USE_MSW && installPromptEvent != null && !installDismissed);

	const qs = useQueryScope();

	const tenantQuery = createQuery(() => ({
		queryKey: qs.keys.tenants.current(),
		queryFn: () => apiGet<Tenant>('/v1/tenants/current')
	}));

	const role = $derived(qs.meQuery.data?.role ?? DEFAULT_ROLE);
	const platformPanelEnabled = $derived(
		canAccessPlatformPanel(qs.meQuery.data?.platform_admin === true, DEV_PANEL_ENABLED)
	);
	const me = $derived(qs.meQuery.data);
	const mePending = $derived(qs.meQuery.isPending);
	const meInitials = $derived(accountInitials(me?.display_name, me?.email));
	const meFirstName = $derived(accountFirstName(me?.display_name, me?.email));
	const queryClient = useQueryClient();

	function accountInitials(name: string | undefined, email: string | undefined): string {
		const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
		if (parts.length >= 2) {
			return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
		}
		if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
		if (parts[0]) return parts[0][0]!.toUpperCase();
		const local = (email ?? '').split('@')[0] ?? '';
		return local.slice(0, 2).toUpperCase();
	}

	function accountFirstName(name: string | undefined, email: string | undefined): string {
		const first = (name ?? '').trim().split(/\s+/).filter(Boolean)[0];
		if (first) return first;
		const local = (email ?? '').split('@')[0] ?? '';
		return local || '…';
	}

	const tenantPending = $derived(tenantQuery.isPending);
	const tenantName = $derived(tenantQuery.data?.name ?? '');
	/** Never empty/undefined — brand alone until tenant name is known. */
	const homeAriaLabel = $derived(
		tenantName ? t('shell.aria.homeWithTenant', { name: tenantName }) : t('shell.aria.home')
	);
	const activeOrgId = $derived(tenantQuery.data?.id ?? me?.tenant_id ?? null);

	const orgsQuery = createQuery(() => ({
		queryKey: ['me', 'organizations', me?.id ?? 'anon'] as const,
		queryFn: listUserOrganizations,
		enabled: Boolean(me?.id)
	}));
	const orgs = $derived(orgsQuery.data ?? []);
	const showOrgSwitcher = $derived(orgs.length > 1);

	const navGroups = $derived(buildNavGroups(getEnabledProductNavItems()));

	$effect(() => {
		const prefs = qs.meQuery.data?.preferences?.enabled_product_modules;
		if (!prefs) return;
		applyServerProductModules(prefs);
	});

	const visibleGroups = $derived(
		navGroups
			.map((group) => ({
				...group,
				items: filterDevPanelNavItems(group.items, platformPanelEnabled).filter((item) =>
					canAccessPath(item.href, role)
				)
			}))
			.filter((group) => group.items.length > 0)
	);

	const showMayaNav = $derived(canSeeNav(mayaNavItem.href, role));

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
			void goto(PANEL_HOME_HREF);
		}
	});

	const allNavHrefs = $derived([
		mayaNavItem.href,
		...navGroups.flatMap((g) =>
			filterDevPanelNavItems(navGroupItems(g), platformPanelEnabled).map((i) => i.href)
		),
		...mobileTabItems.map((i) => i.href)
	]);

	function isActive(href: string): boolean {
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
		accountMenuOpen = false;
	}

	function setSidebarCollapsed(next: boolean) {
		sidebarCollapsed = next;
		accountMenuOpen = false;
		localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
	}

	async function switchOrganization(organizationId: string) {
		accountMenuOpen = false;
		if (organizationId === activeOrgId || orgSwitching) {
			closeMobile();
			return;
		}
		orgSwitching = true;
		orgSwitchError = null;
		try {
			await setActiveOrganization(organizationId);
			closeMobile();
			await resetQueryScope(queryClient);
			await goto(PANEL_HOME_HREF);
		} catch (err) {
			orgSwitchError = err instanceof Error ? err.message : t('shell.orgs.switchFailed');
		} finally {
			orgSwitching = false;
		}
	}

	async function signOut() {
		closeMobile();
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

<div
	class="flex h-dvh max-h-dvh min-h-0 w-full flex-col overflow-hidden bg-bg text-text md:flex-row"
>
	{#snippet sidebarAccountHeader(opts: { showCollapse?: boolean; showClose?: boolean })}
		<!--
			Cursor tarzı üst çubuk: avatar + ad + chevron | zil + panel (kullanıcı, 2026-09-04).
			Mobil drawer’da (`showClose`) daha büyük dokunma alanı.
		-->
		{@const spacious = Boolean(opts.showClose)}
		<div
			class={cn(
				'relative flex shrink-0 items-center gap-0.5 border-b border-border bg-bg',
				spacious ? 'h-16 px-3' : 'h-14 px-2'
			)}
		>
			<button
				type="button"
				class={cn(
					'flex min-w-0 flex-1 items-center rounded-md text-left transition-colors hover:bg-surface-2',
					spacious ? 'gap-2.5 px-2 py-2' : 'gap-2 px-1.5 py-1.5'
				)}
				aria-haspopup="menu"
				aria-expanded={accountMenuOpen}
				aria-label={t('shell.aria.accountMenu')}
				onclick={() => (accountMenuOpen = !accountMenuOpen)}
			>
				<span
					class={cn(
						'flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-semibold text-text',
						spacious ? 'size-9 text-xs' : 'size-7 text-[10px]'
					)}
					aria-hidden="true"
				>
					{#if mePending}
						<span class="size-3.5 animate-pulse rounded-full bg-surface-2"></span>
					{:else}
						{meInitials}
					{/if}
				</span>
				<span class="flex min-w-0 items-center gap-1">
					<span class={cn('truncate font-medium text-text', spacious ? 'text-base' : 'text-sm')}>
						{#if mePending}
							<span
								class="inline-block h-3.5 w-16 animate-pulse rounded bg-surface-2"
								aria-hidden="true"
							></span>
						{:else}
							{meFirstName}
						{/if}
					</span>
					<ChevronDown
						class={cn(
							'shrink-0 text-text-muted transition-transform',
							spacious ? 'size-4' : 'size-3.5',
							accountMenuOpen && 'rotate-180'
						)}
						aria-hidden="true"
					/>
				</span>
			</button>
			<div class="flex shrink-0 items-center">
				<a
					href="/changelog"
					class={cn(
						'relative rounded-[6px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
						spacious ? 'p-2.5' : 'p-2'
					)}
					aria-label={t('nav.changelog')}
					title={t('nav.changelog')}
					onclick={closeMobile}
				>
					<Bell class={spacious ? 'size-5' : 'size-4'} />
					{#if hasUnreadChangelog}
						<span
							class="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-brand"
							aria-hidden="true"
						></span>
					{/if}
				</a>
				{#if opts.showCollapse}
					<button
						type="button"
						class="rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
						aria-label={t('shell.aria.collapseSidebar')}
						title={t('shell.aria.collapseSidebar')}
						onclick={() => setSidebarCollapsed(true)}
					>
						<PanelLeft class="size-4" />
					</button>
				{/if}
				{#if opts.showClose}
					<button
						type="button"
						class="rounded-[6px] p-2.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
						aria-label={t('shell.aria.closeMenu')}
						onclick={closeMobile}
					>
						<X class="size-5" />
					</button>
				{/if}
			</div>

			{#if accountMenuOpen}
				<button
					type="button"
					class="fixed inset-0 z-40 cursor-default"
					aria-label={t('common.close')}
					onclick={() => (accountMenuOpen = false)}
				></button>
				<div
					class="absolute top-full right-2 left-2 z-50 mt-1 overflow-hidden rounded-[8px] border border-border bg-surface shadow-lg"
					role="menu"
				>
					<div class={cn('border-b border-border', spacious ? 'px-3.5 py-3' : 'px-3 py-2.5')}>
						<p class={cn('truncate font-medium text-text', spacious ? 'text-base' : 'text-sm')}>
							{me?.display_name ?? ''}
						</p>
						<p class={cn('truncate text-text-faint', spacious ? 'text-sm' : 'text-xs')}>
							{me?.email ?? ''}
						</p>
					</div>
					{#if showOrgSwitcher}
						<div class="border-b border-border py-1">
							<p
								class={cn(
									'px-3 font-semibold tracking-wider text-text-faint uppercase',
									spacious ? 'py-1.5 text-[11px]' : 'py-1 text-[10px]'
								)}
							>
								{t('shell.orgs.switch')}
							</p>
							{#each orgs as org (org.id)}
								<button
									type="button"
									role="menuitem"
									class={cn(
										'flex w-full items-center gap-2 px-3 text-left transition-colors hover:bg-surface-2',
										spacious ? 'py-2.5 text-base' : 'py-1.5 text-sm',
										org.id === activeOrgId ? 'font-medium text-text' : 'text-text-muted'
									)}
									disabled={orgSwitching}
									onclick={() => void switchOrganization(org.id)}
								>
									<span class="min-w-0 flex-1 truncate">{org.name}</span>
									{#if org.id === activeOrgId}
										<Check class="size-3.5 shrink-0 text-brand" aria-hidden="true" />
									{/if}
								</button>
							{/each}
							{#if orgSwitchError}
								<p class="px-3 py-1 text-xs text-danger" role="alert">{orgSwitchError}</p>
							{/if}
						</div>
					{/if}
					<div class="py-1">
						<a
							href="/account"
							role="menuitem"
							class={cn(
								'flex w-full items-center gap-2 px-3 text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
								spacious ? 'py-2.5 text-base' : 'py-1.5 text-sm'
							)}
							onclick={() => {
								accountMenuOpen = false;
								closeMobile();
							}}
						>
							{t('account.nav')}
						</a>
						<button
							type="button"
							role="menuitem"
							class={cn(
								'flex w-full items-center gap-2 px-3 text-left text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
								spacious ? 'py-2.5 text-base' : 'py-1.5 text-sm'
							)}
							onclick={() => {
								accountMenuOpen = false;
								closeMobile();
								supportOpen = true;
							}}
						>
							{t('shell.support.title')}
						</button>
						<button
							type="button"
							role="menuitem"
							class={cn(
								'flex w-full items-center gap-2 px-3 text-left text-danger transition-colors hover:bg-surface-2',
								spacious ? 'py-2.5 text-base' : 'py-1.5 text-sm'
							)}
							onclick={() => void signOut()}
						>
							{t('shell.signOut')}
						</button>
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet demoChromeNavItem(spacious = false)}
		{#if USE_MSW}
			<li>
				<button
					type="button"
					class={cn(
						'flex w-full items-center rounded-lg text-left font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
						spacious ? 'gap-3 px-3 py-3 text-base' : 'gap-2 px-3 py-1.5 text-sm'
					)}
					onclick={() => toggleDemoChrome()}
				>
					<FlaskConical class={cn('shrink-0', spacious ? 'size-5' : 'size-4')} aria-hidden="true" />
					<span class="min-w-0 flex-1 truncate"
						>{isDemoChromeVisible() ? t('demo.chrome.hide') : t('demo.chrome.show')}</span
					>
				</button>
			</li>
		{/if}
	{/snippet}

	{#if showInstallPrompt}
		<div
			class="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 mx-3 mb-2 rounded-[8px] border border-border bg-surface p-3 shadow-lg md:right-4 md:bottom-4 md:left-auto md:mx-0 md:w-[22rem]"
			role="status"
		>
			<p class="text-sm font-medium text-text">{t('shell.pwa.title')}</p>
			<p class="mt-1 text-xs leading-relaxed text-text-muted">
				{t('shell.pwa.body')}
			</p>
			<div class="mt-3 flex items-center gap-2">
				<Button type="button" class="h-8 px-3 text-xs" onclick={() => void acceptInstall()}>
					{t('shell.pwa.install')}
				</Button>
				<button
					type="button"
					class="h-8 rounded-[6px] px-3 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
					onclick={dismissInstall}
				>
					{t('shell.pwa.dismiss')}
				</button>
			</div>
		</div>
	{/if}

	<!-- Desktop sidebar — TickPort: full viewport height, footer pinned -->
	{#if !sidebarCollapsed}
		<aside class="hidden h-full w-[220px] shrink-0 flex-col border-r border-border bg-bg md:flex">
			{@render sidebarAccountHeader({ showCollapse: true })}

			<nav
				bind:this={desktopNavEl}
				class="sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3"
				aria-label={t('shell.aria.mainMenu')}
			>
				{#if showMayaNav}
					{@const mayaActive = isActive(mayaNavItem.href)}
					{@const MayaIcon = mayaNavItem.icon}
					<ul class="space-y-0">
						<li>
							<a
								href={mayaNavItem.href}
								class={cn(
									'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
									mayaActive
										? 'bg-brand-subtle text-brand-text'
										: 'text-text-muted hover:bg-surface-2 hover:text-text'
								)}
								aria-current={mayaActive ? 'page' : undefined}
							>
								<MayaIcon class="size-4 shrink-0" aria-hidden="true" />
								<span class="truncate">{t(mayaNavItem.labelKey)}</span>
							</a>
						</li>
					</ul>
				{/if}
				{#each visibleGroups as group, gi (group.labelKey)}
					<div class={showMayaNav ? (gi === 0 ? 'mt-3' : 'mt-4') : gi === 0 ? '' : 'mt-4'}>
						<p class="px-3 pb-1 text-[11px] font-semibold text-text-muted">
							{t(group.labelKey)}
						</p>
						<ul class="space-y-0">
							{#each group.items as item (item.href)}
								{@const active = isActive(item.href)}
								{@const Icon = item.icon}
								<li>
									<a
										href={item.href}
										class={cn(
											'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
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
								{#if item.href === '/settings'}
									{@render demoChromeNavItem()}
								{/if}
							{/each}
						</ul>
					</div>
				{/each}
			</nav>

			<div
				class="flex h-[var(--panel-chrome-height)] shrink-0 items-center border-t border-border bg-bg px-4"
			>
				<SidebarVersionFooter />
			</div>
		</aside>
	{/if}

	{#if mobileOpen}
		<button
			type="button"
			class="fixed inset-0 z-40 bg-black/60 md:hidden"
			aria-label={t('shell.aria.closeMenu')}
			onclick={closeMobile}
		></button>
		<aside
			class="fixed inset-y-0 left-0 z-50 flex w-[60vw] max-w-sm flex-col border-r border-border bg-bg md:hidden"
		>
			{@render sidebarAccountHeader({ showClose: true })}
			<nav
				bind:this={mobileNavEl}
				class="sidebar-nav-scroll flex-1 overflow-y-auto px-3 py-4"
				aria-label={t('shell.aria.allMenu')}
			>
				{#if showMayaNav}
					{@const mayaActive = isActive(mayaNavItem.href)}
					{@const MayaIcon = mayaNavItem.icon}
					<ul class="space-y-1">
						<li>
							<a
								href={mayaNavItem.href}
								onclick={closeMobile}
								class={cn(
									'flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
									mayaActive
										? 'bg-brand-subtle text-brand-text'
										: 'text-text-muted hover:bg-surface-2 hover:text-text'
								)}
								aria-current={mayaActive ? 'page' : undefined}
							>
								<MayaIcon class="size-5 shrink-0" aria-hidden="true" />
								<span class="truncate">{t(mayaNavItem.labelKey)}</span>
							</a>
						</li>
					</ul>
				{/if}
				{#each visibleGroups as group, gi (group.labelKey)}
					<div class={showMayaNav ? (gi === 0 ? 'mt-4' : 'mt-5') : gi === 0 ? '' : 'mt-5'}>
						<p class="px-3 pb-1.5 text-xs font-semibold tracking-wide text-text-muted">
							{t(group.labelKey)}
						</p>
						<ul class="space-y-1">
							{#each group.items as item (item.href)}
								{@const active = isActive(item.href)}
								{@const Icon = item.icon}
								<li>
									<a
										href={item.href}
										onclick={closeMobile}
										class={cn(
											'flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-colors',
											active
												? 'bg-brand-subtle text-brand-text'
												: 'text-text-muted hover:bg-surface-2 hover:text-text'
										)}
										aria-current={active ? 'page' : undefined}
									>
										<Icon class="size-5 shrink-0" aria-hidden="true" />
										<span class="truncate">{t(item.labelKey)}</span>
									</a>
								</li>
								{#if item.href === '/settings'}
									{@render demoChromeNavItem(true)}
								{/if}
							{/each}
						</ul>
					</div>
				{/each}
			</nav>
			<div
				class="flex h-[var(--panel-chrome-height)] shrink-0 items-center border-t border-border bg-bg px-4 pb-[env(safe-area-inset-bottom)] max-md:h-auto max-md:py-3 max-md:pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
			>
				<SidebarVersionFooter />
			</div>
		</aside>
	{/if}

	<div class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
		<header
			class="relative sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-border bg-bg/95 backdrop-blur md:static"
		>
			{#if sidebarCollapsed}
				<button
					type="button"
					class="absolute top-1/2 left-2 z-10 hidden -translate-y-1/2 rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text md:inline-flex"
					aria-label={t('shell.aria.expandSidebar')}
					title={t('shell.aria.expandSidebar')}
					onclick={() => setSidebarCollapsed(false)}
				>
					<PanelLeft class="size-5" />
				</button>
			{/if}
			<!--
				Mobil: logo | arama | zil (yan kolonlar auto — üst üste binmez).
				Masaüstü: arama tl-measure ortasında (eşit fr yanlar).
			-->
			<div
				class="tl-measure grid h-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,36rem)_minmax(0,1fr)]"
			>
				<div class="flex shrink-0 items-center justify-start gap-1">
					<a
						href={PANEL_HOME_HREF}
						class="shrink-0 rounded-md text-text md:hidden"
						aria-label={homeAriaLabel}
					>
						{#if tenantPending}
							<span class="block size-7 animate-pulse rounded bg-surface-2" aria-hidden="true"
							></span>
						{:else}
							<BrandMark class="h-7 w-7" title="" />
						{/if}
					</a>
				</div>

				<div class="min-w-0 overflow-hidden">
					<CommandPalette />
				</div>

				<div class="flex shrink-0 items-center justify-end gap-1">
					<a
						href="/changelog"
						class="relative rounded-[6px] p-2 text-text-muted transition-colors hover:bg-surface-2 hover:text-text md:hidden"
						aria-label={t('nav.changelog')}
						title={t('nav.changelog')}
					>
						<Bell class="size-5" />
						{#if hasUnreadChangelog}
							<span
								class="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand"
								aria-hidden="true"
							></span>
						{/if}
					</a>
				</div>
			</div>
		</header>

		{#if USE_MSW && isDemoChromeVisible()}
			<div
				class="shrink-0 border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning"
				role="status"
			>
				{t('demo.banner')}
			</div>
		{/if}

		<main
			class={cn(
				'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto',
				flushMain
					? // Kişi kartı: alt menü payı yazma alanı / sekme gövdesinde (yüzey oraya kadar uzasın).
						'pb-0'
					: 'p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:p-6 md:pb-6'
			)}
		>
			{@render children()}
		</main>
	</div>

	<nav
		class="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
		style="padding-bottom: env(safe-area-inset-bottom)"
		aria-label={t('shell.aria.bottomNav')}
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
					aria-label={t('shell.aria.menu')}
					aria-expanded={mobileOpen}
					onclick={() => (mobileOpen = !mobileOpen)}
				>
					<Menu class="size-5 shrink-0" aria-hidden="true" />
					<span>{t('shell.menu')}</span>
				</button>
			</li>
		</ul>
	</nav>
</div>

<MayaAiFab />

<Dialog
	bind:open={supportOpen}
	title={t('shell.support.title')}
	description={t('shell.support.description')}
>
	<div class="space-y-3 text-sm text-text-muted">
		<p>
			{t('shell.support.body')}
		</p>
		<p>
			<a class="font-medium text-brand hover:underline" href="mailto:{SUPPORT_EMAIL}"
				>{SUPPORT_EMAIL}</a
			>
		</p>
	</div>
	{#snippet footer()}
		<Button type="button" onclick={() => (supportOpen = false)}>{t('shell.support.close')}</Button>
	{/snippet}
</Dialog>
