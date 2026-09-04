<script lang="ts">
	import { goto } from '$app/navigation';
	import HubHomeV4 from '$lib/components/HubHomeV4.svelte';
	import { isMarketingHost } from '$lib/host';
	import { PANEL_HOME_HREF } from '$lib/navigation';

	const marketing = $derived(isMarketingHost());

	$effect(() => {
		if (marketing) return;
		void goto(PANEL_HOME_HREF, { replaceState: true });
	});
</script>

{#if marketing}
	<HubHomeV4 />
{/if}
