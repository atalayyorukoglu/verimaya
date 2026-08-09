<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { createQueryClient } from '$lib/query-client';
	import AppShell from '$lib/components/AppShell.svelte';
	import DevToolbar from '$lib/components/DevToolbar.svelte';
	import { runAuthGate, isPublicPath } from '$lib/auth-gate';
	import { isMarketingHost } from '$lib/host';
	import { USE_MSW } from '$lib/env';
	import { t } from '$lib/i18n/locale.svelte';

	let { children } = $props();

	const queryClient = createQueryClient();
	// SSR/prerender must render real content — never the "Yükleniyor…" placeholder.
	// In the browser, wait for MSW only when the mock worker is active in dev.
	let appReady = $state(!browser || !USE_MSW || !import.meta.env.DEV);
	/** Auth gate finished (or skipped). Prevents flashing panel before redirect. */
	let authReady = $state(!browser || USE_MSW);
	// Public routes + marketing apex `/` — skip AppShell.
	const isBareRoute = $derived(isPublicPath(page.url.pathname));
	/** Marketing hub + public prerender surfaces — indexable. */
	const isIndexablePublic = $derived(
		(page.url.pathname === '/' && isMarketingHost()) ||
			page.url.pathname.startsWith('/vitrin') ||
			page.url.pathname.startsWith('/yapay-zeka-karnesi') ||
			page.url.pathname.startsWith('/kvkk-aydinlatma') ||
			page.url.pathname.startsWith('/app/') ||
			page.url.pathname.startsWith('/crm/') ||
			page.url.pathname.startsWith('/tools/') ||
			page.url.pathname.startsWith('/resources/')
	);

	/** Unregister leftover PWA/MSW workers and wipe Cache Storage.
	 *  Returns true when a controlling/registered SW existed (reload required). */
	async function uninstallDevServiceWorkers(): Promise<boolean> {
		if (!('serviceWorker' in navigator)) return false;
		const hadController = navigator.serviceWorker.controller != null;
		const regs = await navigator.serviceWorker.getRegistrations();
		await Promise.all(regs.map((r) => r.unregister()));
		if ('caches' in window) {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		}
		return hadController || regs.length > 0;
	}

	onMount(async () => {
		if (USE_MSW && import.meta.env.DEV) {
			const { startMockWorker } = await import('$lib/mocks/browser');
			await startMockWorker();
		} else if (import.meta.env.DEV) {
			// PWA SW must not run under Vite: cache-first poisons /src and soft
			// reloads on localhost paint Panel instead of Hub. Always reload after
			// cleanup — sessionStorage gate left tabs stuck on the SW shell.
			const needsReload = await uninstallDevServiceWorkers();
			if (needsReload) {
				window.location.replace(window.location.href);
				return;
			}
		} else if ('serviceWorker' in navigator) {
			// MSW installs its own worker at the same scope — never register both.
			void navigator.serviceWorker.register('/sw.js');
		}
		appReady = true;
	});

	$effect(() => {
		if (!browser || !appReady || USE_MSW) {
			authReady = true;
			return;
		}
		const pathname = page.url.pathname;
		let cancelled = false;
		authReady = false;
		void runAuthGate(pathname).finally(() => {
			if (!cancelled) authReady = true;
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Veri Maya</title>
	{#if !isIndexablePublic}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

{#if appReady && authReady}
	<QueryClientProvider client={queryClient}>
		{#if isBareRoute}
			{@render children()}
		{:else}
			<AppShell>
				{@render children()}
			</AppShell>
		{/if}
		{#if import.meta.env.DEV && USE_MSW}
			<DevToolbar />
		{/if}
	</QueryClientProvider>
{:else}
	<div class="flex min-h-dvh items-center justify-center bg-bg text-sm text-text-muted">
		{t('app.boot.loading')}
	</div>
{/if}
