<script lang="ts">
	import HubHome from '$lib/components/HubHome.svelte';
	import PanelHome from '$lib/components/PanelHome.svelte';
	import { isMarketingHost } from '$lib/host';

	const marketing = $derived(isMarketingHost());
</script>

{#if marketing}
	<HubHome />
{:else}
	<PanelHome />
{/if}
