<script lang="ts">
	import { goto } from '$app/navigation';
	import HomePageD from '$lib/components/HomePageD.svelte';
	import { isMarketingHost } from '$lib/host';
	import { PANEL_HOME_HREF } from '$lib/navigation';

	const marketing = $derived(isMarketingHost());

	$effect(() => {
		if (marketing) return;
		void goto(PANEL_HOME_HREF, { replaceState: true });
	});
</script>

{#if marketing}
	<HomePageD />
{/if}
