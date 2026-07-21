<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { createQueryClient } from '$lib/query-client';
	import AppShell from '$lib/components/AppShell.svelte';
	import DevToolbar from '$lib/components/DevToolbar.svelte';
	import { USE_MSW } from '$lib/env';

	let { children } = $props();

	const queryClient = createQueryClient();
	let appReady = $state(!USE_MSW || !import.meta.env.DEV);
	const isAuthRoute = $derived(page.url.pathname.startsWith('/giris'));

	onMount(async () => {
		if (USE_MSW && import.meta.env.DEV) {
			const { startMockWorker } = await import('$lib/mocks/browser');
			await startMockWorker();
		}
		appReady = true;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Verimaya</title>
</svelte:head>

{#if appReady}
	<QueryClientProvider client={queryClient}>
		{#if isAuthRoute}
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
