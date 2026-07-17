<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { createQueryClient } from '$lib/query-client';
	import AppShell from '$lib/components/AppShell.svelte';
	import DevToolbar from '$lib/components/DevToolbar.svelte';

	let { children } = $props();

	const queryClient = createQueryClient();
	let mswReady = $state(false);

	onMount(async () => {
		if (import.meta.env.DEV) {
			const { startMockWorker } = await import('$lib/mocks/browser');
			await startMockWorker();
		}
		mswReady = true;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Verimaya</title>
</svelte:head>

{#if mswReady || !import.meta.env.DEV}
	<QueryClientProvider client={queryClient}>
		<AppShell>
			{@render children()}
		</AppShell>
		{#if import.meta.env.DEV}
			<DevToolbar />
		{/if}
	</QueryClientProvider>
{:else}
	<div class="bg-bg text-text-muted flex min-h-dvh items-center justify-center text-sm">
		Yükleniyor…
	</div>
{/if}
