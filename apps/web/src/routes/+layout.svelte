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
	import { USE_MSW } from '$lib/env';

	let { children } = $props();

	const queryClient = createQueryClient();
	// SSR/prerender must render real content — never the "Yükleniyor…" placeholder.
	// In the browser, wait for MSW only when the mock worker is active in dev.
	let appReady = $state(!browser || !USE_MSW || !import.meta.env.DEV);
	// Public routes also render under this root layout; skip AppShell for bare surfaces.
	// `/vitrin` lives in `(public)/` but URL is unchanged — keep it here with `/login`.
	const isBareRoute = $derived(
		page.url.pathname.startsWith('/login') || page.url.pathname.startsWith('/vitrin')
	);
	/** Marketing prerender surfaces only — panel + login stay noindex. */
	const isIndexablePublic = $derived(page.url.pathname.startsWith('/vitrin'));

	onMount(async () => {
		if (USE_MSW && import.meta.env.DEV) {
			const { startMockWorker } = await import('$lib/mocks/browser');
			await startMockWorker();
		} else if ('serviceWorker' in navigator) {
			// MSW installs its own worker at the same scope — never register both.
			void navigator.serviceWorker.register('/sw.js');
		}
		appReady = true;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Verimaya</title>
	{#if !isIndexablePublic}
		<meta name="robots" content="noindex" />
	{/if}
</svelte:head>

{#if appReady}
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
		Yükleniyor…
	</div>
{/if}
