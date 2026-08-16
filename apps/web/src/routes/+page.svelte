<script lang="ts">
	import HubHomeV4 from '$lib/components/HubHomeV4.svelte';
	import PanelHome from '$lib/components/PanelHome.svelte';
	import { isMarketingHost } from '$lib/host';

	const marketing = $derived(isMarketingHost());
</script>

{#if marketing}
	<HubHomeV4 />
{:else}
	<PanelHome />
{/if}
